export type UseCase =
  | 'food'
  | 'plant'
  | 'text'
  | 'health'
  | 'code'
  | 'object';

export interface UseCaseInfo {
  id: UseCase;
  label: string;
  emoji: string;
}

export const USE_CASES: UseCaseInfo[] = [
  { id: 'food', label: 'Food and Nutrition', emoji: '🍎' },
  { id: 'plant', label: 'Plant Identifier', emoji: '🌿' },
  { id: 'text', label: 'Text and Documents', emoji: '📄' },
  { id: 'health', label: 'Health and Medicine', emoji: '💊' },
  { id: 'code', label: 'Code Reader', emoji: '💻' },
  { id: 'object', label: 'Object Identifier', emoji: '🔍' },
];

export interface ModelInfo {
  id: string;
  name: string;
  size: string;
  sizeBytes: number;
  modelSrc: string;
  projectionModelSrc?: string;
  supports: UseCase[];
  isDownloaded?: boolean;
  downloadedPath?: string;
  isCustom?: boolean;
}

export interface DownloadedModel extends ModelInfo {
  downloadedPath: string;
  isDownloaded: true;
}

export type ScanResult = FoodResult | PlantResult | TextResult | HealthResult | CodeResult | ObjectResult;

export interface FoodResult {
  type: 'food';
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  healthRating: number;
  ingredients: string[];
  funFact: string;
}

export interface PlantResult {
  type: 'plant';
  plantName: string;
  scientificName: string;
  careLevel: string;
  wateringFrequency: string;
  toxic: boolean;
  toxicTo: string[];
  tips: string[];
  funFact: string;
}

export interface TextResult {
  type: 'text';
  extractedText: string;
  summary: string;
  detectedLanguage: string;
  translation?: string;
  documentType: string;
}

export interface HealthResult {
  type: 'health';
  analysis: string;
  keyInformation: string;
  disclaimer: string;
}

export interface CodeResult {
  type: 'code';
  detectedLanguage: string;
  explanation: string;
  bugs: string[];
  suggestions: string[];
}

export interface ObjectResult {
  type: 'object';
  objectName: string;
  description: string;
  funFact: string;
}

export interface InferenceLog {
  timestamp: string;
  useCase: UseCase;
  modelName: string;
  ttftMs: number;
  totalMs: number;
  tokensPredicted: number;
  deviceModel: string;
  deviceBrand: string;
}

export interface HistoryItem {
  id: string;
  timestamp: string;
  useCase: UseCase;
  result: ScanResult;
  imagePath?: string;
  modelName: string;
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
