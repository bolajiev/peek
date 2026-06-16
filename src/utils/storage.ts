import AsyncStorage from '@react-native-async-storage/async-storage';
import { HistoryItem, InferenceLog, AppSettings, ThemeMode, Accelerator, ResponseLength, DownloadedModel } from '../types';

const KEYS = {
  SETTINGS: '@peek_settings',
  HISTORY: '@peek_history',
  INFERENCE_LOGS: '@peek_inference_logs',
  DOWNLOADED_MODELS: '@peek_downloaded_models',
  SCAN_STREAK: '@peek_scan_streak',
};

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  accelerator: 'gpu',
  responseLength: 'balanced',
  huggingFaceToken: '',
};

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

export async function clearAllData(): Promise<void> {
  const keys = Object.values(KEYS);
  for (const key of keys) {
    await AsyncStorage.removeItem(key);
  }
}
