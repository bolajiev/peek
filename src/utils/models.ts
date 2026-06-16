import {
  SMOLVLM2_500M_MULTIMODAL_F16,
  MMPROJ_SMOLVLM2_500M_MULTIMODAL_F16,
  MEDGEMMA_4B_IT_Q4_1,
  MEDGEMMA_4B_IT_Q8_0,
  QWEN3_5_2B_MULTIMODAL_Q4_K_M,
  MMPROJ_QWEN3_5_2B_MULTIMODAL_BF16,
} from '@qvac/sdk';
import { ModelInfo, UseCase } from '../types';

export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: 'smolvlm2-500m',
    name: 'SmolVLM2-500M',
    size: '500MB',
    sizeBytes: 524288000,
    modelSrc: SMOLVLM2_500M_MULTIMODAL_F16.src,
    projectionModelSrc: MMPROJ_SMOLVLM2_500M_MULTIMODAL_F16.src,
    supports: ['food', 'plant', 'text', 'code', 'object'],
  },
  {
    id: 'medpsy-1.7b',
    name: 'MedPsy-1.7B',
    size: '1GB',
    sizeBytes: 1073741824,
    modelSrc: MEDGEMMA_4B_IT_Q4_1.src,
    supports: ['food', 'health'],
  },
  {
    id: 'medpsy-4b',
    name: 'MedPsy-4B',
    size: '2.5GB',
    sizeBytes: 2684354560,
    modelSrc: MEDGEMMA_4B_IT_Q8_0.src,
    supports: ['food', 'health'],
  },
  {
    id: 'qwen2.5-vl-3b',
    name: 'Qwen2.5-VL-3B',
    size: '2GB',
    sizeBytes: 2147483648,
    modelSrc: QWEN3_5_2B_MULTIMODAL_Q4_K_M.src,
    projectionModelSrc: MMPROJ_QWEN3_5_2B_MULTIMODAL_BF16.src,
    supports: ['food', 'plant', 'text', 'health', 'code', 'object'],
  },
];

export function getModelsForUseCase(useCase: UseCase): ModelInfo[] {
  return AVAILABLE_MODELS.filter((m) => m.supports.includes(useCase));
}

export function getSystemPrompt(useCase: UseCase): string {
  const prompts: Record<UseCase, string> = {
    food: `You are a food nutrition expert. Analyze the image and return ONLY valid JSON with no markdown formatting or code blocks. Use this exact structure: {"foodName": string, "calories": number, "protein": number, "carbs": number, "fat": number, "healthRating": number (1-10), "ingredients": string[], "funFact": string}. Only return the JSON object, nothing else.`,
    plant: `You are a botanist. Analyze the image and return ONLY valid JSON with no markdown formatting or code blocks. Use this exact structure: {"plantName": string, "scientificName": string, "careLevel": string, "wateringFrequency": string, "toxic": boolean, "toxicTo": string[], "tips": string[], "funFact": string}. Only return the JSON object, nothing else.`,
    text: `You are an OCR and document analysis expert. Analyze the image and return ONLY valid JSON with no markdown formatting or code blocks. Use this exact structure: {"extractedText": string, "summary": string, "detectedLanguage": string, "translation": string (if not English, otherwise empty string), "documentType": string}. Only return the JSON object, nothing else.`,
    health: `You are a medical image analyst. Analyze the image and return ONLY valid JSON with no markdown formatting or code blocks. Use this exact structure: {"analysis": string, "keyInformation": string, "disclaimer": "Not medical advice. Consult a professional."}. Only return the JSON object, nothing else.`,
    code: `You are a code review expert. Analyze the image and return ONLY valid JSON with no markdown formatting or code blocks. Use this exact structure: {"detectedLanguage": string, "explanation": string, "bugs": string[], "suggestions": string[]}. Only return the JSON object, nothing else.`,
    object: `You are an object identification expert. Analyze the image and return ONLY valid JSON with no markdown formatting or code blocks. Use this exact structure: {"objectName": string, "description": string, "funFact": string}. Only return the JSON object, nothing else.`,
  };
  return prompts[useCase];
}
