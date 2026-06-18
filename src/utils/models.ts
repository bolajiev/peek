import {
  QWEN3_1_7B_INST_Q4,
  MEDGEMMA_4B_IT_Q4_1,
  SMOLVLM2_500M_MULTIMODAL_Q8_0,
  MMPROJ_SMOLVLM2_500M_MULTIMODAL_Q8_0,
} from '@qvac/sdk';
import { ModelInfo } from '../types';

export const MODEL_KEYS = {
  TEXT_FAST: 'text-fast',
  TEXT_HEALTH: 'text-health',
  VISION: 'vision',
} as const;

export type ModelKey = (typeof MODEL_KEYS)[keyof typeof MODEL_KEYS];

// Exactly three models — no model zoo.
export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: MODEL_KEYS.TEXT_FAST,
    name: 'Qwen3 1.7B · Fast',
    modelType: 'text',
    badge: 'Fast',
    badgeColor: '#6B7280',
    description: 'Lightweight general-purpose AI. Fast responses, low RAM. Good backup when storage is limited.',
    size: '1.1GB',
    sizeBytes: 1_056_782_912,
    modelSrc: QWEN3_1_7B_INST_Q4.src,
    supports: ['text'],
  },
  {
    id: MODEL_KEYS.TEXT_HEALTH,
    name: 'MedPsy · Health AI',
    modelType: 'text',
    badge: 'Default',
    badgeColor: '#FDC803',
    description: 'Default AI with deep health and medical knowledge. Best for Quick Chat, Scribe, Voice, and Deep.',
    size: '2.4GB',
    sizeBytes: 2_564_052_800,
    modelSrc: MEDGEMMA_4B_IT_Q4_1.src,
    supports: ['text', 'health'],
  },
  {
    id: MODEL_KEYS.VISION,
    name: 'SmolVLM2 · Vision',
    modelType: 'vision',
    badge: 'Vision',
    badgeColor: '#3B82F6',
    description: 'On-device vision model for Peek Lens. Analyzes photos, food, labels, and more.',
    size: '521MB',
    sizeBytes: 436_808_704 + 108_785_184,
    modelSrc: SMOLVLM2_500M_MULTIMODAL_Q8_0.src,
    projectionModelSrc: MMPROJ_SMOLVLM2_500M_MULTIMODAL_Q8_0.src,
    supports: ['vision'],
  },
];

export function isTextModel(m: ModelInfo): boolean {
  return m.modelType === 'text';
}

export function isVisionModel(m: ModelInfo): boolean {
  return m.modelType === 'vision';
}

export function getModelByKey(key: string): ModelInfo | undefined {
  return AVAILABLE_MODELS.find(m => m.id === key);
}

const HF_REGEX = /registry:\/\/hf\/([^/]+\/[^/]+)\/(resolve|blob)\/([^/]+)\/(.+)/;

export function getHfDownloadUrl(modelSrc: string): string {
  const match = modelSrc.match(HF_REGEX);
  if (match) {
    return `https://huggingface.co/${match[1]}/resolve/${match[3]}/${match[4]}`;
  }
  return modelSrc;
}

// Neutral system prompts — no "Peek Health" persona.
export const SYSTEM_PROMPTS = {
  chat: `You are Peek, a private AI assistant running fully on-device. Answer clearly and concisely.`,
  scribe: `You are Peek, a private AI writing assistant running fully on-device. Help draft, edit, and refine documents and notes. Format output in clear markdown with headers and bullet points where helpful.`,
  deep: `You are Peek, a private research assistant running fully on-device. The user has loaded a local document for analysis. Answer questions strictly based on the provided context. If the answer isn't in the context, say so clearly. Never fabricate information. Format responses in markdown.`,
  voice: `Summarise the following transcript in 3–5 concise bullet points. Format as markdown bullet points.`,
  quickchat: `You are Peek, a fast private AI assistant running fully on-device. Keep answers concise and practical.`,
};

export const DEFAULT_PROMPTS: Record<string, string> = {
  food: `You are a professional nutritionist and food scientist with deep knowledge of global cuisine. Analyze the food visible in this image carefully.

Respond with ONLY a valid JSON object — no markdown, no code blocks, no text before or after.

Required format:
{
  "foodName": "Specific name of the food or dish",
  "calories": 350,
  "protein": 15.5,
  "carbs": 42.0,
  "fat": 12.3,
  "fiber": 4.0,
  "healthRating": 7,
  "servingSize": "1 serving (approx. 250g)",
  "ingredients": ["main ingredient 1", "main ingredient 2", "main ingredient 3"],
  "funFact": "One surprising or interesting fact about this food"
}

Rules:
- calories in kcal, all macros in grams (decimals OK)
- healthRating: 1–10 integer (10 = nutrient-dense whole food, 1 = highly processed junk)
- ingredients: 3–6 most prominent components
- servingSize: estimate based on what you see
- If multiple foods are visible, focus on the main dish
- Output ONLY the JSON, nothing else`,

  plant: `You are a professional botanist and horticulturist. Identify and analyze the plant in this image.

Respond with ONLY a valid JSON object — no markdown, no code blocks, no text before or after.

Required format:
{
  "plantName": "Common name of the plant",
  "scientificName": "Genus species",
  "careLevel": "Beginner",
  "wateringFrequency": "e.g. Every 7–10 days",
  "sunlight": "e.g. Bright indirect light",
  "toxic": false,
  "toxicTo": ["cats", "dogs"],
  "tips": ["Practical tip 1", "Practical tip 2", "Practical tip 3"],
  "funFact": "One fascinating fact about this plant"
}

Output ONLY the JSON, nothing else`,

  text: `You are an expert OCR engine and document analyst. Extract and analyze ALL text visible in this image.

Respond with ONLY a valid JSON object — no markdown, no code blocks, no text before or after.

Required format:
{
  "documentType": "e.g. Receipt / Menu / Book Page / Street Sign / Label",
  "detectedLanguage": "e.g. English",
  "extractedText": "Every word of text visible in the image, preserving structure",
  "summary": "2–3 sentence summary of what this document contains",
  "translation": "English translation if source is non-English, otherwise null"
}

Output ONLY the JSON, nothing else`,

  health: `You are a medical information assistant. Analyze the health or medical content in this image.

Respond with ONLY a valid JSON object — no markdown, no code blocks, no text before or after.

Required format:
{
  "analysis": "Detailed description from a medical/health perspective",
  "keyInformation": "Most clinically relevant information extracted",
  "disclaimer": "This analysis is for informational purposes only and is not medical advice. Always consult a qualified healthcare professional before making any health decisions."
}

Output ONLY the JSON, nothing else`,

  code: `You are a senior software engineer. Analyze the code visible in this image.

Respond with ONLY a valid JSON object — no markdown, no code blocks, no text before or after.

Required format:
{
  "detectedLanguage": "Programming language",
  "explanation": "Clear, plain-English explanation of what this code does",
  "bugs": ["Bug or error 1", "Bug or error 2"],
  "suggestions": ["Improvement 1", "Improvement 2"]
}

Output ONLY the JSON, nothing else`,

  object: `You are an expert in object identification. Identify and describe the object in this image.

Respond with ONLY a valid JSON object — no markdown, no code blocks, no text before or after.

Required format:
{
  "objectName": "Specific name of the object",
  "category": "e.g. Electronics / Furniture / Tool / Vehicle",
  "description": "Detailed description of what this object is and what it's used for",
  "estimatedValue": "Rough price range if applicable, or null",
  "funFact": "One surprising or little-known fact about this object"
}

Output ONLY the JSON, nothing else`,
};

export function getSystemPrompt(useCase: string): string {
  return DEFAULT_PROMPTS[useCase] ?? '';
}
