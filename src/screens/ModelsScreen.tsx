import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { File, Directory } from 'expo-file-system';
import { createDownloadResumable } from 'expo-file-system/legacy';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { AVAILABLE_MODELS, getHfDownloadUrl } from '../utils/models';
import {
  getDownloadedModels,
  saveDownloadedModel,
  removeDownloadedModel,
  getHfToken,
  getModelsDir,
  initModelsDirectory,
  syncModelsFromDisk,
} from '../utils/storage';
import { ModelInfo, DownloadedModel } from '../types';

type DownloadPhase = {
  phase: 'model' | 'mmproj';
  pct: number;
  bytesWritten: number;
  bytesTotal: number;
};

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const gb = bytes / 1e9;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / 1e6)} MB`;
}

export default function ModelsScreen() {
  const theme = getTheme(useTheme());
  const [downloadedModels, setDownloadedModels] = useState<DownloadedModel[]>([]);
  const [downloading, setDownloading] = useState<Record<string, DownloadPhase>>({});

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    await initModelsDirectory();
    const synced = await syncModelsFromDisk();
    setDownloadedModels(synced);
  };

  const loadDownloaded = async () => {
    const models = await getDownloadedModels();
    setDownloadedModels(models);
  };

  const isDownloaded = (modelId: string) =>
    downloadedModels.some((m) => m.id === modelId);

  const startDownload = async (model: ModelInfo) => {
    const token = await getHfToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const modelFolder = new Directory(getModelsDir(), model.id);
    modelFolder.create({ intermediates: true, idempotent: true });

    setDownloading((prev) => ({
      ...prev,
      [model.id]: { phase: 'model', pct: 0, bytesWritten: 0, bytesTotal: model.sizeBytes },
    }));

    try {
      const url = getHfDownloadUrl(model.modelSrc);
      const fileUri = new File(modelFolder, 'model.gguf').uri;

      const dl = createDownloadResumable(url, fileUri, { headers }, (p) => {
        const pct = p.totalBytesExpectedToWrite > 0
          ? Math.round((p.totalBytesWritten / p.totalBytesExpectedToWrite) * 100)
          : 0;
        setDownloading((prev) => ({
          ...prev,
          [model.id]: {
            phase: 'model', pct,
            bytesWritten: p.totalBytesWritten,
            bytesTotal: p.totalBytesExpectedToWrite,
          },
        }));
      });

      const result = await dl.downloadAsync();
      if (!result) throw new Error('Download cancelled');

      let localProjectionSrc: string | undefined;

      if (model.projectionModelSrc) {
        setDownloading((prev) => ({
          ...prev,
          [model.id]: { phase: 'mmproj', pct: 0, bytesWritten: 0, bytesTotal: 0 },
        }));

        const mmUrl = getHfDownloadUrl(model.projectionModelSrc);
        const mmUri = new File(modelFolder, 'mmproj.gguf').uri;

        const mmDl = createDownloadResumable(mmUrl, mmUri, { headers }, (p) => {
          const pct = p.totalBytesExpectedToWrite > 0
            ? Math.round((p.totalBytesWritten / p.totalBytesExpectedToWrite) * 100)
            : 0;
          setDownloading((prev) => ({
            ...prev,
            [model.id]: {
              phase: 'mmproj', pct,
              bytesWritten: p.totalBytesWritten,
              bytesTotal: p.totalBytesExpectedToWrite,
            },
          }));
        });

        const mmResult = await mmDl.downloadAsync();
        if (mmResult) localProjectionSrc = mmResult.uri;
      }

      const newModel: DownloadedModel = {
        ...model,
        modelSrc: result.uri,
        projectionModelSrc: localProjectionSrc,
        downloadedPath: result.uri,
        isDownloaded: true,
      };
      await saveDownloadedModel(newModel);
      setDownloading((prev) => { const n = { ...prev }; delete n[model.id]; return n; });
      await loadDownloaded();
    } catch {
      setDownloading((prev) => { const n = { ...prev }; delete n[model.id]; return n; });
      Alert.alert('Download Failed', 'Could not download the model. Check your internet connection and try again.');
    }
  };

  const handleDownload = async (model: ModelInfo) => {
    const hasProjection = !!model.projectionModelSrc;
    const sizeLabel = `${model.size}${hasProjection ? ' + vision file' : ''}`;

    if (model.sizeBytes > 1.5e9) {
      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Large Download',
          `${model.name} requires ${sizeLabel} of storage.\n\nUse Wi-Fi — this may take several minutes. The model may take 30–60 seconds to load after download.`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Download', onPress: () => resolve(true) },
          ]
        );
      });
      if (!confirmed) return;
    }

    startDownload(model);
  };

  const handleDelete = (model: DownloadedModel) => {
    Alert.alert(
      'Remove Model',
      `Delete ${model.name} from your device? You can download it again later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => doDelete(model.id) },
      ]
    );
  };

  const doDelete = async (modelId: string) => {
    const folder = new Directory(getModelsDir(), modelId);
    try {
      if (folder.exists) folder.delete();
    } catch {}
    await removeDownloadedModel(modelId);
    await loadDownloaded();
  };

  const renderProgress = (modelId: string) => {
    const state = downloading[modelId];
    if (!state) return null;

    const label = state.phase === 'model' ? 'Downloading model' : 'Downloading vision file';
    const detail = state.bytesTotal > 0
      ? `${formatBytes(state.bytesWritten)} / ${formatBytes(state.bytesTotal)}`
      : `${state.pct}%`;

    return (
      <View style={styles.progressWrapper}>
        <View style={styles.progressHeader}>
          <Text style={[styles.progressLabel, { color: theme.text }]}>{label}…</Text>
          <Text style={[styles.progressDetail, { color: theme.textSecondary }]}>{detail}</Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
          <View style={[styles.progressFill, { backgroundColor: theme.accent, width: `${state.pct}%` }]} />
        </View>
      </View>
    );
  };

  const renderModelCard = (model: ModelInfo, showDelete: boolean) => {
    const dl = isDownloaded(model.id);
    const isDownloading = downloading[model.id] !== undefined;
    const isVision = !!model.projectionModelSrc;
    const dlModel = showDelete ? downloadedModels.find((m) => m.id === model.id) : null;

    return (
      <View
        key={model.id}
        style={[
          styles.modelCard,
          { backgroundColor: theme.card, borderColor: model.badge === 'Recommended' ? theme.accent : 'transparent', borderWidth: model.badge === 'Recommended' ? 1.5 : 0 },
        ]}
      >
        {/* Top row: badge + actions */}
        <View style={styles.cardTop}>
          <View style={styles.cardTopLeft}>
            {model.badge && (
              <View style={[styles.badge, { backgroundColor: model.badgeColor || theme.accent }]}>
                <Text style={styles.badgeText}>{model.badge}</Text>
              </View>
            )}
          </View>

          {!isDownloading && (
            <View style={styles.cardActions}>
              {dl ? (
                <>
                  <View style={[styles.checkmark, { backgroundColor: theme.accent + '22', borderColor: theme.accent + '55' }]}>
                    <Text style={[styles.checkmarkText, { color: theme.accent }]}>✓ On Device</Text>
                  </View>
                  {showDelete && dlModel && (
                    <TouchableOpacity
                      style={[styles.deleteBtn, { borderColor: theme.error }]}
                      onPress={() => handleDelete(dlModel)}
                    >
                      <Text style={[styles.deleteBtnText, { color: theme.error }]}>Delete</Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                <TouchableOpacity
                  style={[styles.downloadBtn, { backgroundColor: theme.accent }]}
                  onPress={() => handleDownload(model)}
                >
                  <Text style={[styles.downloadBtnText, { color: '#fff' }]}>Get</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Model name */}
        <Text style={[styles.modelName, { color: theme.text }]}>{model.name}</Text>

        {/* Description */}
        {model.description && (
          <Text style={[styles.modelDescription, { color: theme.textSecondary }]}>
            {model.description}
          </Text>
        )}

        {/* Chips row */}
        <View style={styles.chipsRow}>
          <View style={[styles.chip, { borderColor: theme.border }]}>
            <Text style={[styles.chipText, { color: theme.textSecondary }]}>{model.size}</Text>
          </View>
          {isVision ? (
            <View style={[styles.chip, { borderColor: '#3B82F6' + '66', backgroundColor: '#3B82F6' + '15' }]}>
              <Text style={[styles.chipText, { color: '#3B82F6' }]}>Vision</Text>
            </View>
          ) : (
            <View style={[styles.chip, { borderColor: theme.border }]}>
              <Text style={[styles.chipText, { color: theme.textSecondary }]}>Text Only</Text>
            </View>
          )}
        </View>

        {isDownloading && renderProgress(model.id)}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {downloadedModels.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>On Device</Text>
              <View style={[styles.countBadge, { backgroundColor: theme.accent }]}>
                <Text style={[styles.countText, { color: '#fff' }]}>{downloadedModels.length}</Text>
              </View>
            </View>
            {downloadedModels.map((m) => renderModelCard(m, true))}
          </>
        )}

        <View style={[styles.sectionHeader, downloadedModels.length > 0 && { marginTop: 28 }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Available</Text>
        </View>

        <Text style={[styles.sectionHint, { color: theme.textSecondary }]}>
          All models run entirely on your device — your data never leaves your phone.
        </Text>

        {AVAILABLE_MODELS.map((m) => renderModelCard(m, false))}

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10,
  },
  sectionTitle: { fontSize: 19, fontWeight: '700' },
  sectionHint: { fontSize: 13, marginBottom: 16, lineHeight: 18 },
  countBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { fontSize: 12, fontWeight: '700' },
  modelCard: {
    borderRadius: 16, padding: 16, marginBottom: 12,
  },
  cardTop: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 8,
  },
  cardTopLeft: { flex: 1, marginRight: 8 },
  badge: {
    alignSelf: 'flex-start', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  badgeText: {
    fontSize: 10, fontWeight: '700', color: '#fff',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkmark: {
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  checkmarkText: { fontSize: 12, fontWeight: '600' },
  downloadBtn: {
    borderRadius: 10, paddingHorizontal: 18, paddingVertical: 8,
  },
  downloadBtnText: { fontSize: 14, fontWeight: '700' },
  deleteBtn: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  deleteBtnText: { fontSize: 13, fontWeight: '600' },
  modelName: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  modelDescription: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
  chipsRow: { flexDirection: 'row', gap: 6 },
  chip: {
    borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  chipText: { fontSize: 12, fontWeight: '500' },
  progressWrapper: { marginTop: 14 },
  progressHeader: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6,
  },
  progressLabel: { fontSize: 13, fontWeight: '600' },
  progressDetail: { fontSize: 12 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
});
