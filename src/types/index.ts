export type UseCase = 'scan' | 'chat';
export type ModuleId = 'lens' | 'voice' | 'scribe' | 'deep' | 'quickchat';

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
  modelType: 'vision' | 'text';
  supports: string[];
  isDownloaded?: boolean;
  downloadedPath?: string;
  isCustom?: boolean;
}

export interface Conversation {
  id: string;
  moduleId: ModuleId;
  title: string;
  createdAt: string;
  updatedAt: string;
  modelId?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  imagePath?: string;
  thinking?: string;
  createdAt: string;
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
