import AsyncStorage from '@react-native-async-storage/async-storage';
import { Paths, File, Directory } from 'expo-file-system';
import { Platform } from 'react-native';
import { HistoryItem, InferenceLog, AppSettings, ThemeMode, Accelerator, ResponseLength, DownloadedModel, Conversation, ChatMessage, ModuleId } from '../types';
import { AVAILABLE_MODELS } from './models';

// QVAC SDK expects bare filesystem paths, not file:// URIs.
export function toPath(uri: string): string {
  return uri.startsWith('file://') ? uri.slice(7) : uri;
}

const KEYS = {
  SETTINGS: '@peek_settings',
  HISTORY: '@peek_history',
  INFERENCE_LOGS: '@peek_inference_logs',
  DOWNLOADED_MODELS: '@peek_downloaded_models',
  SCAN_STREAK: '@peek_scan_streak',
  HF_TOKEN: 'peek_hf_token',
  CUSTOM_PROMPTS: '@peek_custom_prompts',
};

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  accelerator: 'cpu',
  responseLength: 'balanced',
  huggingFaceToken: '',
};

// On Android, save to external app storage (/Android/data/com.peek.app/files/)
// so users can see files in a file manager. On iOS, use internal documents.
export function getModelsDir(): Directory {
  if (Platform.OS === 'android') {
    return new Directory('file:///storage/emulated/0/Android/data/com.peek.app/files/peek/models');
  }
  return new Directory(Paths.document, 'peek', 'models');
}

// Internal storage dir — needed for migration only
function getInternalModelsDir(): Directory {
  return new Directory(Paths.document, 'peek', 'models');
}

export async function initModelsDirectory(): Promise<void> {
  const dir = getModelsDir();
  dir.create({ intermediates: true, idempotent: true });
  await migrateOldModelFolders();
}

// Maps old model folder names (pre-v4) to new canonical IDs.
const FOLDER_RENAMES: Record<string, string> = {
  'medpsy-1.7b':     'text-health',
  'smolvlm2-500m-q8': 'vision',
  'smolvlm2-500m':    'vision',
};

function moveModelFiles(srcFolder: Directory, dstFolder: Directory): void {
  dstFolder.create({ intermediates: true, idempotent: true });
  const srcModel = new File(srcFolder, 'model.gguf');
  if (srcModel.exists) srcModel.move(new File(dstFolder, 'model.gguf'));
  const srcMmproj = new File(srcFolder, 'mmproj.gguf');
  if (srcMmproj.exists) srcMmproj.move(new File(dstFolder, 'mmproj.gguf'));
  try { srcFolder.delete(); } catch {}
}

async function migrateOldModelFolders(): Promise<void> {
  const externalDir = getModelsDir();
  const internalDir = getInternalModelsDir();
  const isAndroid = Platform.OS === 'android';

  // All IDs we care about (old names + new names)
  const allIds = [
    ...Object.keys(FOLDER_RENAMES),
    ...Object.values(FOLDER_RENAMES),
    'text-fast',
  ];

  for (const id of [...new Set(allIds)]) {
    const targetId = FOLDER_RENAMES[id] ?? id;
    const dstFolder = new Directory(externalDir, targetId);
    const dstReady = new File(dstFolder, 'model.gguf').exists;
    if (dstReady) continue;

    // Try: same location but old name
    const srcSameLoc = new Directory(externalDir, id);
    if (srcSameLoc.exists) {
      try { moveModelFiles(srcSameLoc, dstFolder); } catch {}
      continue;
    }

    // On Android: try internal storage (pre-external-storage fix) with old or new name
    if (isAndroid) {
      const srcInternal = new Directory(internalDir, id);
      if (srcInternal.exists) {
        try { moveModelFiles(srcInternal, dstFolder); } catch {}
      }
    }
  }
}

export async function syncModelsFromDisk(): Promise<DownloadedModel[]> {
  await initModelsDirectory();
  const modelsDir = getModelsDir();
  const synced: DownloadedModel[] = [];

  for (const model of AVAILABLE_MODELS) {
    const modelFolder = new Directory(modelsDir, model.id);
    const modelFile = new File(modelFolder, 'model.gguf');
    if (!modelFile.exists) continue;

    const mmprojFile = new File(modelFolder, 'mmproj.gguf');

    synced.push({
      ...model,
      modelSrc: modelFile.uri,
      projectionModelSrc: mmprojFile.exists ? mmprojFile.uri : undefined,
      downloadedPath: modelFile.uri,
      isDownloaded: true,
    });
  }

  await AsyncStorage.setItem(KEYS.DOWNLOADED_MODELS, JSON.stringify(synced));
  return synced;
}

export async function getSettings(): Promise<AppSettings> {
  try {
    const data = await AsyncStorage.getItem(KEYS.SETTINGS);
    if (data) return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    return DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const current = await getSettings();
  const updated = { ...current, ...settings };
  await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(updated));
}

export async function getThemeMode(): Promise<ThemeMode> {
  const settings = await getSettings();
  return settings.theme;
}

export async function setThemeMode(mode: ThemeMode): Promise<void> {
  await saveSettings({ theme: mode });
}

export async function getAccelerator(): Promise<Accelerator> {
  const settings = await getSettings();
  return settings.accelerator;
}

export async function setAccelerator(accel: Accelerator): Promise<void> {
  await saveSettings({ accelerator: accel });
}

export async function getResponseLength(): Promise<ResponseLength> {
  const settings = await getSettings();
  return settings.responseLength;
}

export async function setResponseLength(length: ResponseLength): Promise<void> {
  await saveSettings({ responseLength: length });
}

export async function getHuggingFaceToken(): Promise<string> {
  const settings = await getSettings();
  return settings.huggingFaceToken;
}

export async function setHuggingFaceToken(token: string): Promise<void> {
  await saveSettings({ huggingFaceToken: token });
  await AsyncStorage.setItem(KEYS.HF_TOKEN, token);
}

export async function getHfToken(): Promise<string> {
  try {
    const token = await AsyncStorage.getItem(KEYS.HF_TOKEN);
    return token || '';
  } catch {
    return '';
  }
}

export async function getHistory(): Promise<HistoryItem[]> {
  try {
    const data = await AsyncStorage.getItem(KEYS.HISTORY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function addHistoryItem(item: HistoryItem): Promise<void> {
  const history = await getHistory();
  history.unshift(item);
  await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(history));
}

export async function clearHistory(): Promise<void> {
  await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify([]));
}

export async function clearHistoryByCategory(useCase: string): Promise<void> {
  const history = await getHistory();
  const filtered = history.filter((item) => (item as any).useCase !== useCase);
  await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(filtered));
}

export async function getInferenceLogs(): Promise<InferenceLog[]> {
  try {
    const data = await AsyncStorage.getItem(KEYS.INFERENCE_LOGS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function addInferenceLog(log: InferenceLog): Promise<void> {
  const logs = await getInferenceLogs();
  logs.push(log);
  await AsyncStorage.setItem(KEYS.INFERENCE_LOGS, JSON.stringify(logs));
}

export async function getDownloadedModels(): Promise<DownloadedModel[]> {
  try {
    const data = await AsyncStorage.getItem(KEYS.DOWNLOADED_MODELS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function saveDownloadedModel(model: DownloadedModel): Promise<void> {
  const models = await getDownloadedModels();
  const idx = models.findIndex((m) => m.id === model.id);
  if (idx >= 0) {
    models[idx] = model;
  } else {
    models.push(model);
  }
  await AsyncStorage.setItem(KEYS.DOWNLOADED_MODELS, JSON.stringify(models));
}

export async function removeDownloadedModel(id: string): Promise<void> {
  const models = await getDownloadedModels();
  const filtered = models.filter((m) => m.id !== id);
  await AsyncStorage.setItem(KEYS.DOWNLOADED_MODELS, JSON.stringify(filtered));
}

export async function getScanStreak(): Promise<{ lastScanDate: string; count: number }> {
  try {
    const data = await AsyncStorage.getItem(KEYS.SCAN_STREAK);
    return data ? JSON.parse(data) : { lastScanDate: '', count: 0 };
  } catch {
    return { lastScanDate: '', count: 0 };
  }
}

export async function updateScanStreak(): Promise<number> {
  const streak = await getScanStreak();
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  let newCount = 1;
  if (streak.lastScanDate === today) {
    newCount = streak.count;
  } else if (streak.lastScanDate === yesterday) {
    newCount = streak.count + 1;
  }

  await AsyncStorage.setItem(
    KEYS.SCAN_STREAK,
    JSON.stringify({ lastScanDate: today, count: newCount })
  );
  return newCount;
}

export async function isModelDownloaded(): Promise<boolean> {
  const models = await getDownloadedModels();
  return models.length > 0;
}

export async function hasOnboarded(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem('@peek_onboarded');
    return val === 'true';
  } catch {
    return false;
  }
}

export async function markOnboarded(): Promise<void> {
  await AsyncStorage.setItem('@peek_onboarded', 'true');
}

export async function getDefaultModelId(): Promise<string | null> {
  return AsyncStorage.getItem('@peek_default_model');
}

export async function setDefaultModelId(modelId: string): Promise<void> {
  await AsyncStorage.setItem('@peek_default_model', modelId);
}

export async function getQuickChatDefaultId(): Promise<string | null> {
  return AsyncStorage.getItem('@peek_quickchat_default');
}

export async function setQuickChatDefaultId(modelId: string): Promise<void> {
  await AsyncStorage.setItem('@peek_quickchat_default', modelId);
}

export async function getThemeOverride(): Promise<'dark' | 'light' | null> {
  const val = await AsyncStorage.getItem('@peek_theme_override');
  if (val === 'dark' || val === 'light') return val;
  return null;
}

export async function setThemeOverride(mode: 'dark' | 'light'): Promise<void> {
  await AsyncStorage.setItem('@peek_theme_override', mode);
}

export async function getCustomSystemPrompt(useCase: string): Promise<string | null> {
  try {
    const data = await AsyncStorage.getItem(KEYS.CUSTOM_PROMPTS);
    if (!data) return null;
    const map = JSON.parse(data) as Record<string, string>;
    return map[useCase] ?? null;
  } catch {
    return null;
  }
}

export async function setCustomSystemPrompt(useCase: string, prompt: string): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(KEYS.CUSTOM_PROMPTS);
    const map = data ? (JSON.parse(data) as Record<string, string>) : {};
    map[useCase] = prompt;
    await AsyncStorage.setItem(KEYS.CUSTOM_PROMPTS, JSON.stringify(map));
  } catch {}
}

export async function clearCustomSystemPrompt(useCase: string): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(KEYS.CUSTOM_PROMPTS);
    if (!data) return;
    const map = JSON.parse(data) as Record<string, string>;
    delete map[useCase];
    await AsyncStorage.setItem(KEYS.CUSTOM_PROMPTS, JSON.stringify(map));
  } catch {}
}

export async function clearAllData(): Promise<void> {
  const keys = [...Object.values(KEYS), '@peek_onboarded'];
  for (const key of keys) {
    await AsyncStorage.removeItem(key);
  }
}

// ── Conversation history (per-module, persisted) ─────────────────────────────

function convListKey(moduleId: string) { return `@peek_convs_${moduleId}`; }
function msgListKey(convId: string) { return `@peek_msgs_${convId}`; }

export async function getConversations(moduleId: ModuleId): Promise<Conversation[]> {
  try {
    const data = await AsyncStorage.getItem(convListKey(moduleId));
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

export async function saveConversation(conv: Conversation): Promise<void> {
  const list = await getConversations(conv.moduleId);
  const idx = list.findIndex(c => c.id === conv.id);
  if (idx >= 0) list[idx] = conv; else list.unshift(conv);
  await AsyncStorage.setItem(convListKey(conv.moduleId), JSON.stringify(list));
}

export async function deleteConversation(moduleId: ModuleId, convId: string): Promise<void> {
  const list = await getConversations(moduleId);
  await AsyncStorage.setItem(convListKey(moduleId), JSON.stringify(list.filter(c => c.id !== convId)));
  await AsyncStorage.removeItem(msgListKey(convId));
}

export async function getMessages(convId: string): Promise<ChatMessage[]> {
  try {
    const data = await AsyncStorage.getItem(msgListKey(convId));
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

export async function appendMessage(msg: ChatMessage): Promise<void> {
  const msgs = await getMessages(msg.conversationId);
  msgs.push(msg);
  await AsyncStorage.setItem(msgListKey(msg.conversationId), JSON.stringify(msgs));
}

export async function updateLastMessage(convId: string, content: string): Promise<void> {
  const msgs = await getMessages(convId);
  if (msgs.length > 0) {
    msgs[msgs.length - 1].content = content;
    await AsyncStorage.setItem(msgListKey(convId), JSON.stringify(msgs));
  }
}

export function createConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

