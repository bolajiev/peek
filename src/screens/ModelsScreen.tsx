import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { Paths, File, Directory } from 'expo-file-system';
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

export default function ModelsScreen() {
  const theme = getTheme(useTheme());
  const [downloadedModels, setDownloadedModels] = useState<DownloadedModel[]>([]);
  const [downloading, setDownloading] = useState<Record<string, number>>({});
  const [customUrl, setCustomUrl] = useState('');
  const [customName, setCustomName] = useState('');
  const [loadFromDeviceName, setLoadFromDeviceName] = useState('');

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

  const handleDownload = async (model: ModelInfo) => {
    const token = await getHfToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const modelDir = getModelsDir();
    modelDir.create({ intermediates: true, idempotent: true });

    setDownloading((prev) => ({ ...prev, [model.id]: 0 }));

    try {
      const destFile = new File(modelDir, `${model.id}.gguf`);
      const url = getHfDownloadUrl(model.modelSrc);

      const file = await File.downloadFileAsync(url, destFile, {
        headers,
        idempotent: true,
      });

      const newModel: DownloadedModel = {
        ...model,
        downloadedPath: file.uri,
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
      Alert.alert('Download Failed', 'Could not download the model.');
    }
  };

  const handleDelete = async (modelId: string) => {
    const model = downloadedModels.find((m) => m.id === modelId);
    if (model?.downloadedPath) {
      const f = new File(model.downloadedPath);
      if (f.exists) f.delete();
    }
    await removeDownloadedModel(modelId);
    await loadDownloaded();
  };

  const handleCustomDownload = async () => {
    if (!customUrl || !customName) {
      Alert.alert('Missing Info', 'Enter a URL and a name for the custom model.');
      return;
    }

    const token = await getHfToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const modelDir = getModelsDir();
    modelDir.create({ intermediates: true, idempotent: true });

    const customId = `custom-${Date.now()}`;
    setDownloading((prev) => ({ ...prev, [customId]: 0 }));

    try {
      const destFile = new File(modelDir, `custom_${customName}.gguf`);

      const file = await File.downloadFileAsync(customUrl, destFile, {
        headers,
        idempotent: true,
      });

      const newModel: DownloadedModel = {
        id: customId,
        name: customName,
        size: 'Custom',
        sizeBytes: 0,
        modelSrc: file.uri,
        supports: ['food', 'plant', 'text', 'health', 'code', 'object'],
        downloadedPath: file.uri,
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

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const picked = result.assets[0];
      if (!picked.uri) return;

      const modelDir = getModelsDir();
      modelDir.create({ intermediates: true, idempotent: true });

      const destFile = new File(modelDir, `${loadFromDeviceName.trim()}.gguf`);
      const srcFile = new File(picked.uri);
      srcFile.copy(destFile);

      const modelId = `loaded-${Date.now()}`;
      const newModel: DownloadedModel = {
        id: modelId,
        name: loadFromDeviceName.trim(),
        size: picked.size ? `${(picked.size / 1048576).toFixed(1)}MB` : '',
        sizeBytes: picked.size || 0,
        modelSrc: destFile.uri,
        supports: ['food', 'plant', 'text', 'health', 'code', 'object'],
        downloadedPath: destFile.uri,
        isDownloaded: true,
        isCustom: true,
      };
      await saveDownloadedModel(newModel);
      setLoadFromDeviceName('');
      await loadDownloaded();
      Alert.alert('Loaded', `Model "${newModel.name}" loaded from device.`);
    } catch {
      Alert.alert('Error', 'Could not load model from device.');
    }
  };

  const formatUseCases = (supports: string[]) => {
    const labels: Record<string, string> = {
      food: '🍎 Food',
      plant: '🌿 Plant',
      text: '📄 Text',
      health: '💊 Health',
      code: '💻 Code',
      object: '🔍 Object',
    };
    return supports.map((s) => labels[s] || s).join(', ');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Downloaded Models
          </Text>
          <Text style={[styles.sectionCount, { color: theme.textSecondary }]}>
            {downloadedModels.length}
          </Text>
        </View>

        {downloadedModels.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No models downloaded yet
            </Text>
          </View>
        ) : (
          downloadedModels.map((model) => (
            <View
              key={model.id}
              style={[styles.modelCard, { backgroundColor: theme.card }]}
            >
              <View style={styles.modelInfo}>
                <Text style={[styles.modelName, { color: theme.text }]}>
                  {model.name}
                </Text>
                <Text style={[styles.modelMeta, { color: theme.textSecondary }]}>
                  {model.size || 'Unknown'} • Downloaded
                </Text>
                <Text style={[styles.modelUseCases, { color: theme.textSecondary }]}>
                  {formatUseCases(model.supports)}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.deleteButton, { borderColor: theme.error }]}
                onPress={() => handleDelete(model.id)}
              >
                <Text style={[styles.deleteText, { color: theme.error }]}>
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        <View style={[styles.sectionHeader, { marginTop: 32 }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Available Models
          </Text>
        </View>

        {AVAILABLE_MODELS.map((model) => {
          const dl = isDownloaded(model.id);
          const isDownloading = downloading[model.id] !== undefined;

          return (
            <View
              key={model.id}
              style={[styles.modelCard, { backgroundColor: theme.card }]}
            >
              <View style={styles.modelInfo}>
                <Text style={[styles.modelName, { color: theme.text }]}>
                  {model.name}
                </Text>
                <Text style={[styles.modelMeta, { color: theme.textSecondary }]}>
                  {model.size}
                </Text>
                <Text
                  style={[styles.modelUseCases, { color: theme.textSecondary }]}
                >
                  {formatUseCases(model.supports)}
                </Text>
              </View>
              {isDownloading ? (
                <View style={styles.progressContainer}>
                  <View
                    style={[
                      styles.progressBar,
                      { backgroundColor: theme.border },
                    ]}
                  >
                    <View
                      style={[
                        styles.progressFill,
                        {
                          backgroundColor: theme.accent,
                          width: `${downloading[model.id]}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.progressText,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {downloading[model.id]}%
                  </Text>
                </View>
              ) : dl ? (
                <View style={[styles.downloadedBadge, { backgroundColor: theme.accent }]}>
                  <Text
                    style={[
                      styles.downloadedBadgeText,
                      { color: theme.background },
                    ]}
                  >
                    ✓
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.downloadButton, { backgroundColor: theme.accent }]}
                  onPress={() => handleDownload(model)}
                >
                  <Text
                    style={[
                      styles.downloadButtonText,
                      { color: theme.background },
                    ]}
                  >
                    Download
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        <View style={[styles.sectionHeader, { marginTop: 32 }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Custom Model
          </Text>
        </View>
        <View style={[styles.customCard, { backgroundColor: theme.card }]}>
          <TextInput
            style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
            placeholder="HuggingFace GGUF URL"
            placeholderTextColor={theme.textSecondary}
            value={customUrl}
            onChangeText={setCustomUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
            placeholder="Model name"
            placeholderTextColor={theme.textSecondary}
            value={customName}
            onChangeText={setCustomName}
          />
          <TouchableOpacity
            style={[styles.downloadButton, { backgroundColor: theme.accent, alignSelf: 'flex-start', marginTop: 8 }]}
            onPress={handleCustomDownload}
          >
            <Text style={[styles.downloadButtonText, { color: theme.background }]}>
              Download Custom Model
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.sectionHeader, { marginTop: 32 }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Load from Device
          </Text>
        </View>
        <View style={[styles.customCard, { backgroundColor: theme.card }]}>
          <TextInput
            style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
            placeholder="Model name"
            placeholderTextColor={theme.textSecondary}
            value={loadFromDeviceName}
            onChangeText={setLoadFromDeviceName}
          />
          <TouchableOpacity
            style={[styles.downloadButton, { backgroundColor: theme.accent, alignSelf: 'flex-start', marginTop: 8 }]}
            onPress={handleLoadFromDevice}
          >
            <Text style={[styles.downloadButtonText, { color: theme.background }]}>
              Pick .gguf from Device
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 60,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  sectionCount: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptyCard: {
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
  modelCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modelInfo: {
    flex: 1,
    marginRight: 12,
  },
  modelName: {
    fontSize: 16,
    fontWeight: '700',
  },
  modelMeta: {
    fontSize: 13,
    marginTop: 2,
  },
  modelUseCases: {
    fontSize: 12,
    marginTop: 4,
  },
  deleteButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  deleteText: {
    fontSize: 13,
    fontWeight: '600',
  },
  downloadButton: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  downloadButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  downloadedBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadedBadgeText: {
    fontSize: 16,
    fontWeight: '800',
  },
  progressContainer: {
    alignItems: 'center',
    gap: 4,
  },
  progressBar: {
    width: 60,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
  },
  customCard: {
    borderRadius: 12,
    padding: 16,
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 8,
  },
});
