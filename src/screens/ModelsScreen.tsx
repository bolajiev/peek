import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { File } from 'expo-file-system';
import { createDownloadResumable } from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
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

const TAG_OPTIONS: { id: string; label: string; emoji: string }[] = [
  { id: 'food', label: 'Food & Nutrition', emoji: '🍎' },
  { id: 'plant', label: 'Plant Identifier', emoji: '🌿' },
  { id: 'text', label: 'Text & Documents', emoji: '📄' },
  { id: 'health', label: 'Health & Medicine', emoji: '💊' },
  { id: 'code', label: 'Code Reader', emoji: '💻' },
  { id: 'object', label: 'Object Identifier', emoji: '🔍' },
];

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
  const [customUrl, setCustomUrl] = useState('');
  const [customName, setCustomName] = useState('');
  const [loadFromDeviceName, setLoadFromDeviceName] = useState('');

  const [showTagPicker, setShowTagPicker] = useState(false);
  const [pendingAction, setPendingAction] = useState<'download' | 'custom' | 'load' | null>(null);
  const [pendingModel, setPendingModel] = useState<ModelInfo | null>(null);
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const [pickedFileUri, setPickedFileUri] = useState<string | null>(null);

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

  const toggleTag = (tag: string) => {
    setPendingTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const confirmTags = async () => {
    if (!pendingAction) return;
    setShowTagPicker(false);
    const tags = pendingTags;

    switch (pendingAction) {
      case 'download':
        if (pendingModel) await startDownload(pendingModel, tags);
        break;
      case 'custom':
        await startCustomDownload(tags);
        break;
      case 'load':
        if (pickedFileUri && loadFromDeviceName.trim()) {
          await startLoadDevice(pickedFileUri, loadFromDeviceName.trim(), tags);
        }
        break;
    }

    setPendingAction(null);
    setPendingModel(null);
    setPickedFileUri(null);
  };

  const startDownload = async (model: ModelInfo, tags: string[]) => {
    const token = await getHfToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    getModelsDir().create({ intermediates: true, idempotent: true });

    setDownloading((prev) => ({
      ...prev,
      [model.id]: { phase: 'model', pct: 0, bytesWritten: 0, bytesTotal: model.sizeBytes },
    }));

    try {
      const url = getHfDownloadUrl(model.modelSrc);
      const fileUri = new File(getModelsDir(), model.id + '.gguf').uri;

      const dl = createDownloadResumable(url, fileUri, { headers }, (p) => {
        const pct = p.totalBytesExpectedToWrite > 0
          ? Math.round((p.totalBytesWritten / p.totalBytesExpectedToWrite) * 100)
          : 0;
        setDownloading((prev) => ({
          ...prev,
          [model.id]: {
            phase: 'model',
            pct,
            bytesWritten: p.totalBytesWritten,
            bytesTotal: p.totalBytesExpectedToWrite,
          },
        }));
      });

      const result = await dl.downloadAsync();
      if (!result) throw new Error('Download cancelled');

      let localProjectionSrc = model.projectionModelSrc;

      if (model.projectionModelSrc) {
        setDownloading((prev) => ({
          ...prev,
          [model.id]: { phase: 'mmproj', pct: 0, bytesWritten: 0, bytesTotal: 0 },
        }));

        const mmUrl = getHfDownloadUrl(model.projectionModelSrc);
        const mmUri = new File(getModelsDir(), model.id + '-mmproj.gguf').uri;

        const mmDl = createDownloadResumable(mmUrl, mmUri, { headers }, (p) => {
          const pct = p.totalBytesExpectedToWrite > 0
            ? Math.round((p.totalBytesWritten / p.totalBytesExpectedToWrite) * 100)
            : 0;
          setDownloading((prev) => ({
            ...prev,
            [model.id]: {
              phase: 'mmproj',
              pct,
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
        supports: tags,
        downloadedPath: result.uri,
        isDownloaded: true,
      };
      await saveDownloadedModel(newModel);
      setDownloading((prev) => {
        const n = { ...prev };
        delete n[model.id];
        return n;
      });
      await loadDownloaded();
    } catch {
      setDownloading((prev) => {
        const n = { ...prev };
        delete n[model.id];
        return n;
      });
      Alert.alert(
        'Download Failed',
        'Could not download the model. Check your internet connection and try again.'
      );
    }
  };

  const handleDownload = async (model: ModelInfo) => {
    if (model.sizeBytes > 1.5e9) {
      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Large Download',
          `${model.name} requires ${model.size} of storage${model.projectionModelSrc ? ' plus an additional vision file' : ''}.\n\nPlease use Wi-Fi. This may take several minutes.\n\nLoading after download can take 30–60 seconds.`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Download', onPress: () => resolve(true) },
          ]
        );
      });
      if (!confirmed) return;
    }

    setPendingTags([...model.supports]);
    setPendingModel(model);
    setPendingAction('download');
    setShowTagPicker(true);
  };

  const startCustomDownload = async (tags: string[]) => {
    const token = await getHfToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    getModelsDir().create({ intermediates: true, idempotent: true });

    const customId = `custom-${Date.now()}`;
    setDownloading((prev) => ({
      ...prev,
      [customId]: { phase: 'model', pct: 0, bytesWritten: 0, bytesTotal: 0 },
    }));

    try {
      const fileUri = new File(getModelsDir(), 'custom_' + customName + '.gguf').uri;

      const dl = createDownloadResumable(customUrl, fileUri, { headers }, (p) => {
        const pct = p.totalBytesExpectedToWrite > 0
          ? Math.round((p.totalBytesWritten / p.totalBytesExpectedToWrite) * 100)
          : 0;
        setDownloading((prev) => ({
          ...prev,
          [customId]: {
            phase: 'model',
            pct,
            bytesWritten: p.totalBytesWritten,
            bytesTotal: p.totalBytesExpectedToWrite,
          },
        }));
      });

      const result = await dl.downloadAsync();
      if (!result) throw new Error('Download cancelled');

      const newModel: DownloadedModel = {
        id: customId,
        name: customName,
        size: formatBytes(result.headers?.['content-length']
          ? parseInt(result.headers['content-length'], 10)
          : 0),
        sizeBytes: 0,
        modelSrc: result.uri,
        supports: tags,
        downloadedPath: result.uri,
        isDownloaded: true,
        isCustom: true,
      };
      await saveDownloadedModel(newModel);
      setDownloading((prev) => {
        const n = { ...prev };
        delete n[customId];
        return n;
      });
      setCustomUrl('');
      setCustomName('');
      await loadDownloaded();
    } catch {
      setDownloading((prev) => {
        const n = { ...prev };
        delete n[customId];
        return n;
      });
      Alert.alert('Download Failed', 'Could not download the custom model.');
    }
  };

  const handleCustomDownload = () => {
    if (!customUrl || !customName) {
      Alert.alert('Missing Info', 'Enter a URL and a name for the custom model.');
      return;
    }
    setPendingTags([]);
    setPendingAction('custom');
    setShowTagPicker(true);
  };

  const startLoadDevice = async (srcUri: string, name: string, tags: string[]) => {
    getModelsDir().create({ intermediates: true, idempotent: true });
    try {
      const destFile = new File(getModelsDir(), name + '.gguf');
      const srcFile = new File(srcUri);
      srcFile.copy(destFile);

      const newModel: DownloadedModel = {
        id: `loaded-${Date.now()}`,
        name,
        size: '',
        sizeBytes: 0,
        modelSrc: destFile.uri,
        supports: tags,
        downloadedPath: destFile.uri,
        isDownloaded: true,
        isCustom: true,
      };
      await saveDownloadedModel(newModel);
      setLoadFromDeviceName('');
      await loadDownloaded();
      Alert.alert('Loaded', `"${name}" is ready to use.`);
    } catch {
      Alert.alert('Error', 'Could not load the model file. Make sure it is a valid .gguf file.');
    }
  };

  const handleLoadFromDevice = async () => {
    if (!loadFromDeviceName.trim()) {
      Alert.alert('Missing Name', 'Enter a name for the model first.');
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const picked = result.assets[0];
      if (!picked.uri) return;

      setPickedFileUri(picked.uri);
      setPendingTags([]);
      setPendingAction('load');
      setShowTagPicker(true);
    } catch {
      Alert.alert('Error', 'Could not pick file.');
    }
  };

  const handleDelete = (modelId: string) => {
    Alert.alert('Delete Model', 'This will remove the model from your device. You can download it again later.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => doDelete(modelId) },
    ]);
  };

  const doDelete = async (modelId: string) => {
    const model = downloadedModels.find((m) => m.id === modelId);
    if (model?.downloadedPath) {
      const f = new File(model.downloadedPath);
      if (f.exists) f.delete();
    }
    await removeDownloadedModel(modelId);
    await loadDownloaded();
  };

  const formatstrings = (supports: string[]) => {
    if (supports.length === 6) return 'All categories';
    const labels: Record<string, string> = {
      food: 'Food', plant: 'Plant', text: 'Text',
      health: 'Health', code: 'Code', object: 'Object',
    };
    return supports.map((s) => labels[s] || s).join(', ');
  };

  const renderProgress = (modelId: string) => {
    const state = downloading[modelId];
    if (!state) return null;

    const label = state.phase === 'model' ? 'Downloading model' : 'Downloading vision projector';
    const detail = state.bytesTotal > 0
      ? `${formatBytes(state.bytesWritten)} / ${formatBytes(state.bytesTotal)}`
      : `${state.pct}%`;

    return (
      <View style={styles.progressWrapper}>
        <View style={styles.progressHeader}>
          <Text style={[styles.progressLabel, { color: theme.text }]}>
            {label}...
          </Text>
          <Text style={[styles.progressDetail, { color: theme.textSecondary }]}>
            {detail}
          </Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: theme.accent, width: `${state.pct}%` },
            ]}
          />
        </View>
      </View>
    );
  };

  const renderModelCard = (model: ModelInfo, showDelete: boolean) => {
    const dl = isDownloaded(model.id);
    const isDownloading = downloading[model.id] !== undefined;

    return (
      <View
        key={model.id}
        style={[
          styles.modelCard,
          { backgroundColor: theme.card },
          model.badge === 'Recommended' && { borderColor: theme.accent, borderWidth: 1.5 },
        ]}
      >
        <View style={styles.cardTop}>
          <View style={styles.modelMeta}>
            {model.badge && (
              <View style={[styles.badge, { backgroundColor: model.badgeColor || theme.accent }]}>
                <Text style={styles.badgeText}>{model.badge}</Text>
              </View>
            )}
            <Text style={[styles.modelName, { color: theme.text }]}>{model.name}</Text>
          </View>

          {!isDownloading && (
            <View style={styles.cardActions}>
              {dl ? (
                <>
                  <View style={[styles.downloadedMark, { backgroundColor: theme.accent }]}>
                    <Text style={[styles.downloadedMarkText, { color: theme.background }]}>✓</Text>
                  </View>
                  {showDelete && (
                    <TouchableOpacity
                      style={[styles.deleteBtn, { borderColor: theme.error }]}
                      onPress={() => handleDelete(model.id)}
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
                  <Text style={[styles.downloadBtnText, { color: theme.background }]}>Download</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {model.description && (
          <Text style={[styles.modelDescription, { color: theme.textSecondary }]}>
            {model.description}
          </Text>
        )}

        <View style={styles.cardMeta}>
          <Text style={[styles.metaChip, { color: theme.textSecondary, borderColor: theme.border }]}>
            {model.size}
          </Text>
          <Text style={[styles.metaText, { color: theme.textSecondary }]}>
            {formatstrings(model.supports)}
          </Text>
        </View>

        {isDownloading && renderProgress(model.id)}
      </View>
    );
  };

  const isLargeDownload = pendingModel && pendingModel.sizeBytes > 1.5e9;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {downloadedModels.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>My Models</Text>
              <View style={[styles.countBadge, { backgroundColor: theme.accent }]}>
                <Text style={[styles.countText, { color: theme.background }]}>
                  {downloadedModels.length}
                </Text>
              </View>
            </View>
            {downloadedModels.map((m) => renderModelCard(m, true))}
          </>
        )}

        <View style={[styles.sectionHeader, downloadedModels.length > 0 && { marginTop: 32 }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Available Models</Text>
        </View>

        <Text style={[styles.sectionHint, { color: theme.textSecondary }]}>
          Models run entirely on your device. Your data never leaves your phone.
        </Text>

        {AVAILABLE_MODELS.map((m) => renderModelCard(m, false))}

        <View style={[styles.sectionHeader, { marginTop: 32 }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Custom Model</Text>
        </View>
        <View style={[styles.customCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.customHint, { color: theme.textSecondary }]}>
            Download any GGUF model from a direct URL
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
            placeholder="Direct GGUF download URL"
            placeholderTextColor={theme.textSecondary}
            value={customUrl}
            onChangeText={setCustomUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
            placeholder="Model name (e.g. My Model)"
            placeholderTextColor={theme.textSecondary}
            value={customName}
            onChangeText={setCustomName}
          />
          <TouchableOpacity
            style={[styles.downloadBtn, { backgroundColor: theme.accent, alignSelf: 'flex-start', marginTop: 8 }]}
            onPress={handleCustomDownload}
          >
            <Text style={[styles.downloadBtnText, { color: theme.background }]}>Download</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.sectionHeader, { marginTop: 32 }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Load from Device</Text>
        </View>
        <View style={[styles.customCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.customHint, { color: theme.textSecondary }]}>
            Use a .gguf file already on your phone
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
            placeholder="Model name (e.g. My Local Model)"
            placeholderTextColor={theme.textSecondary}
            value={loadFromDeviceName}
            onChangeText={setLoadFromDeviceName}
          />
          <TouchableOpacity
            style={[styles.downloadBtn, { backgroundColor: theme.accent, alignSelf: 'flex-start', marginTop: 8 }]}
            onPress={handleLoadFromDevice}
          >
            <Text style={[styles.downloadBtnText, { color: theme.background }]}>Pick File</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={showTagPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTagPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              What will you scan?
            </Text>

            {pendingModel && (
              <View style={[
                styles.modalModelInfo,
                { backgroundColor: theme.background, borderColor: theme.border },
              ]}>
                <Text style={[styles.modalModelName, { color: theme.text }]}>
                  {pendingModel.name}
                </Text>
                <Text style={[styles.modalModelSize, { color: theme.textSecondary }]}>
                  {pendingModel.size}
                  {pendingModel.projectionModelSrc ? ' + vision file' : ''}
                </Text>
              </View>
            )}

            {isLargeDownload && (
              <View style={[styles.warningBox, { backgroundColor: '#FF9500' + '22', borderColor: '#FF9500' }]}>
                <Text style={[styles.warningText, { color: '#FF9500' }]}>
                  ⚠️  Large download — use Wi-Fi. Loading after download takes 30–60 seconds.
                </Text>
              </View>
            )}

            <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
              Choose which scan types this model will support:
            </Text>

            {TAG_OPTIONS.map((tag) => {
              const selected = pendingTags.includes(tag.id);
              return (
                <TouchableOpacity
                  key={tag.id}
                  style={[
                    styles.tagItem,
                    {
                      backgroundColor: selected ? theme.accent + '22' : theme.background,
                      borderColor: selected ? theme.accent : theme.border,
                    },
                  ]}
                  onPress={() => toggleTag(tag.id)}
                >
                  <Text style={styles.tagEmoji}>{tag.emoji}</Text>
                  <Text style={[styles.tagItemText, { color: selected ? theme.accent : theme.text }]}>
                    {tag.label}
                  </Text>
                  {selected && (
                    <Text style={[styles.tagCheck, { color: theme.accent }]}>✓</Text>
                  )}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[
                styles.modalButton,
                {
                  backgroundColor: pendingTags.length === 0 ? theme.border : theme.accent,
                },
              ]}
              onPress={confirmTags}
              disabled={pendingTags.length === 0}
            >
              <Text style={[styles.modalButtonText, { color: theme.background }]}>
                {pendingTags.length === 0 ? 'Select at least one' : `Start Download (${pendingTags.length} selected)`}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalCancel, { borderColor: theme.border }]}
              onPress={() => setShowTagPicker(false)}
            >
              <Text style={[styles.modalCancelText, { color: theme.textSecondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  sectionHint: {
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  countBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modelCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  modelMeta: {
    flex: 1,
    marginRight: 12,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modelName: {
    fontSize: 16,
    fontWeight: '700',
  },
  modelDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaChip: {
    fontSize: 12,
    fontWeight: '600',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  metaText: {
    fontSize: 12,
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  downloadedMark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadedMarkText: {
    fontSize: 16,
    fontWeight: '800',
  },
  downloadBtn: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  downloadBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  deleteBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  deleteBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  progressWrapper: {
    marginTop: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  progressDetail: {
    fontSize: 12,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  customCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  customHint: {
    fontSize: 13,
    marginBottom: 12,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  modalModelInfo: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalModelName: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalModelSize: {
    fontSize: 13,
  },
  warningBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  warningText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 12,
  },
  tagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 10,
  },
  tagEmoji: {
    fontSize: 18,
  },
  tagItemText: {
    fontSize: 15,
    flex: 1,
  },
  tagCheck: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalCancel: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
