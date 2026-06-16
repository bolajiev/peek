export type UseCase = 'scan' | 'chat';

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  badge?: string;
  badgeColor?: string;
  size: string;
  sizeBytes: number;
  modelSrc: string;
  projectionModelSrc?: string;
  supports: string[];
  isDownloaded?: boolean;
  downloadedPath?: string;
  isCustom?: boolean;
}

export interface DownloadedModel extends ModelInfo {
  downloadedPath: string;
  isDownloaded: true;
}

export interface ScanResult {
  type: string;
  text: string;
  query: string;
  _rawText?: string;
}

export interface HistoryItem {
  id: string;
  timestamp: string;
  query: string;
  result: ScanResult;
  imagePath?: string;
  modelName: string;
}

export interface InferenceLog {
  timestamp: string;
  modelName: string;
  ttftMs: number;
  totalMs: number;
  tokensPredicted: number;
  deviceModel: string;
  deviceBrand: string;
}

export type ThemeMode = 'dark' | 'light';
export type Accelerator = 'gpu' | 'cpu';
export type ResponseLength = 'short' | 'balanced' | 'detailed';

export interface AppSettings {
  theme: ThemeMode;
  accelerator: Accelerator;
  responseLength: ResponseLength;
  huggingFaceToken: string;
}
