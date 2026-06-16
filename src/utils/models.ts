import {
  SMOLVLM2_500M_MULTIMODAL_F16,
  MMPROJ_SMOLVLM2_500M_MULTIMODAL_F16,
  SMOLVLM2_500M_MULTIMODAL_Q8_0,
  MMPROJ_SMOLVLM2_500M_MULTIMODAL_Q8_0,
  MEDGEMMA_4B_IT_Q4_1,
  MEDGEMMA_4B_IT_Q8_0,
  QWEN3_5_2B_MULTIMODAL_Q4_K_M,
  MMPROJ_QWEN3_5_2B_MULTIMODAL_BF16,
  QWEN3VL_2B_MULTIMODAL_Q4_K,
  MMPROJ_QWEN3VL_2B_MULTIMODAL_Q4_K,
  QWEN3_5_0_8B_MULTIMODAL_Q4_K_M,
  MMPROJ_QWEN3_5_0_8B_MULTIMODAL_Q8_0,
  QWEN3_5_4B_MULTIMODAL_Q4_K_M,
  MMPROJ_QWEN3_5_4B_MULTIMODAL_BF16,
  OCR_0_6B_MULTIMODAL_Q4_K_M,
  MMPROJ_OCR_0_6B_MULTIMODAL_F16,
  GEMMA4_4B_MULTIMODAL_Q4_K_M,
  MMPROJ_GEMMA4_4B_MULTIMODAL_BF16,
} from '@qvac/sdk';
import { ModelInfo } from '../types';

const ALL: string[] = ['food', 'plant', 'text', 'health', 'code', 'object'];

export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: 'medpsy-1.7b',
    name: 'MedPsy-1.7B',
    badge: 'Recommended',
    badgeColor: '#00CC6A',
    description: 'qvac\'s purpose-built health & nutrition AI. Best balance of speed and accuracy for everyday use.',
    size: '2.4GB',
    sizeBytes: 2564052800,
    modelSrc: MEDGEMMA_4B_IT_Q4_1.src,
    supports: ['food', 'health'],
  },
  {
    id: 'smolvlm2-500m-q8',
    name: 'SmolVLM2-500M Lite',
    badge: 'Low-End Friendly',
    badgeColor: '#3B82F6',
    description: 'Smallest model available. Ideal for older phones or limited storage. Loads instantly.',
    size: '546MB',
    sizeBytes: 546308096,
    modelSrc: SMOLVLM2_500M_MULTIMODAL_Q8_0.src,
    projectionModelSrc: MMPROJ_SMOLVLM2_500M_MULTIMODAL_Q8_0.src,
    supports: ALL,
  },
  {
    id: 'qwen3-5-0.8b',
    name: 'Qwen3.5-0.8B',
    badge: 'Fast',
    badgeColor: '#F59E0B',
    description: 'Ultra-compact vision model. Quick scans with decent accuracy across all categories.',
    size: '649MB',
    sizeBytes: 649216000,
    modelSrc: QWEN3_5_0_8B_MULTIMODAL_Q4_K_M.src,
    projectionModelSrc: MMPROJ_QWEN3_5_0_8B_MULTIMODAL_Q8_0.src,
    supports: ALL,
  },
  {
    id: 'smolvlm2-500m',
    name: 'SmolVLM2-500M',
    description: 'Full-precision version of SmolVLM2. Sharper detail recognition than the Lite variant.',
    size: '1GB',
    sizeBytes: 1019215872,
    modelSrc: SMOLVLM2_500M_MULTIMODAL_F16.src,
    projectionModelSrc: MMPROJ_SMOLVLM2_500M_MULTIMODAL_F16.src,
    supports: ALL,
  },
  {
    id: 'qwen3vl-2b',
    name: 'Qwen3-VL-2B',
    description: 'Purpose-built vision-language model with strong scene understanding. Good all-rounder.',
    size: '1.5GB',
    sizeBytes: 1552000000,
    modelSrc: QWEN3VL_2B_MULTIMODAL_Q4_K.src,
    projectionModelSrc: MMPROJ_QWEN3VL_2B_MULTIMODAL_Q4_K.src,
    supports: ALL,
  },
  {
    id: 'qwen2.5-vl-3b',
    name: 'Qwen3.5-VL-2B',
    badge: 'Balanced',
    badgeColor: '#8B5CF6',
    description: 'Solid everyday model. Good accuracy without needing a high-end device.',
    size: '1.9GB',
    sizeBytes: 1952000000,
    modelSrc: QWEN3_5_2B_MULTIMODAL_Q4_K_M.src,
    projectionModelSrc: MMPROJ_QWEN3_5_2B_MULTIMODAL_BF16.src,
    supports: ALL,
  },
  {
    id: 'ocr-0.6b',
    name: 'OCR Specialist',
    badge: 'Text & Docs Only',
    badgeColor: '#6366F1',
    description: 'Fine-tuned specifically for reading text and documents. Much more accurate than general models for OCR.',
    size: '1.2GB',
    sizeBytes: 1216000000,
    modelSrc: OCR_0_6B_MULTIMODAL_Q4_K_M.src,
    projectionModelSrc: MMPROJ_OCR_0_6B_MULTIMODAL_F16.src,
    supports: ['text'],
  },
  {
    id: 'qwen3-5-4b',
    name: 'Qwen3.5-4B',
    badge: 'High Quality',
    badgeColor: '#EC4899',
    description: 'Best general-purpose accuracy in the lineup. Recommended when you need reliable results.',
    size: '3.4GB',
    sizeBytes: 3417000000,
    modelSrc: QWEN3_5_4B_MULTIMODAL_Q4_K_M.src,
    projectionModelSrc: MMPROJ_QWEN3_5_4B_MULTIMODAL_BF16.src,
    supports: ALL,
  },
  {
    id: 'medpsy-4b',
    name: 'MedPsy-4B',
    badge: 'Medical Grade',
    badgeColor: '#EF4444',
    description: 'qvac\'s premium health model. Highest accuracy for medical images and nutrition analysis.',
    size: '4.1GB',
    sizeBytes: 4130402880,
    modelSrc: MEDGEMMA_4B_IT_Q8_0.src,
    supports: ['food', 'health'],
  },
  {
    id: 'gemma4-4b',
    name: 'Gemma 4 (4B)',
    badge: 'Best Accuracy',
    badgeColor: '#EAB308',
    description: 'Google\'s latest vision model. Top-tier image understanding for complex scenes. Large download.',
    size: '6.4GB',
    sizeBytes: 6397000000,
    modelSrc: GEMMA4_4B_MULTIMODAL_Q4_K_M.src,
    projectionModelSrc: MMPROJ_GEMMA4_4B_MULTIMODAL_BF16.src,
    supports: ALL,
  },
];

export function getModelsForUseCase(useCase: string): ModelInfo[] {
  return AVAILABLE_MODELS.filter((m) => m.supports.includes(useCase));
}

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
  "careLevel": "Beginner" | "Intermediate" | "Expert",
  "wateringFrequency": "e.g. Every 7–10 days",
  "sunlight": "e.g. Bright indirect light",
  "toxic": false,
  "toxicTo": ["cats", "dogs"],
  "tips": ["Practical tip 1", "Practical tip 2", "Practical tip 3"],
  "funFact": "One fascinating fact about this plant"
}

Rules:
- toxic: true if dangerous to humans or common pets
- toxicTo: who it's toxic to; empty array [] if safe
- tips: 3 specific, actionable care tips
- If you can't identify with certainty, give your best identification with a note in funFact
- Output ONLY the JSON, nothing else`,

  text: `You are an expert OCR engine and document analyst. Extract and analyze ALL text visible in this image.

Respond with ONLY a valid JSON object — no markdown, no code blocks, no text before or after.

Required format:
{
  "documentType": "e.g. Receipt / Menu / Book Page / Street Sign / Label / Letter / Form / Handwritten Note",
  "detectedLanguage": "e.g. English",
  "extractedText": "Every word of text visible in the image, preserving structure where possible",
  "summary": "2–3 sentence summary of what this document contains or says",
  "translation": "English translation if source is non-English, otherwise null"
}

Rules:
- extractedText: transcribe ALL readable text, use \\n for line breaks
- If text is partially obscured, include what you can read with [...] for unreadable parts
- summary: explain the purpose/content of the document clearly
- translation: only include if language is not English; otherwise set to null
- Output ONLY the JSON, nothing else`,

  health: `You are a medical information assistant. Analyze the health or medical content in this image and provide helpful information.

Respond with ONLY a valid JSON object — no markdown, no code blocks, no text before or after.

Required format:
{
  "analysis": "Detailed description of what you observe in the image from a medical/health perspective",
  "keyInformation": "The most clinically relevant information extracted — dosage, warnings, ingredients, measurements, or observations",
  "disclaimer": "This analysis is for informational purposes only and is not medical advice. Always consult a qualified healthcare professional before making any health decisions."
}

Rules:
- analysis: be thorough but accessible — explain medical terms in plain language
- keyInformation: extract specific details (drug names, dosages, warnings, measurements)
- Never provide definitive diagnoses; say "may indicate" or "appears to show" instead
- Always include the disclaimer exactly as shown above
- Output ONLY the JSON, nothing else`,

  code: `You are a senior software engineer and code reviewer with expertise across all major programming languages. Analyze the code visible in this image.

Respond with ONLY a valid JSON object — no markdown, no code blocks, no text before or after.

Required format:
{
  "detectedLanguage": "Programming language (e.g. Python, TypeScript, Rust)",
  "explanation": "Clear, plain-English explanation of what this code does and its purpose",
  "bugs": ["Bug or error 1 with brief fix hint", "Bug or error 2"],
  "suggestions": ["Improvement 1", "Improvement 2", "Improvement 3"]
}

Rules:
- explanation: describe the code's purpose and logic as if explaining to a junior developer
- bugs: actual errors, logic flaws, security issues, or anti-patterns — empty [] if code looks correct
- suggestions: 2–4 concrete improvements for readability, performance, or best practices
- If code is too small to fully analyze, note that in explanation
- Output ONLY the JSON, nothing else`,

  object: `You are an expert in object identification, history, and general knowledge. Identify and describe the object in this image.

Respond with ONLY a valid JSON object — no markdown, no code blocks, no text before or after.

Required format:
{
  "objectName": "Specific name of the object",
  "category": "e.g. Electronics / Furniture / Tool / Vehicle / Food / Nature / Art / Clothing",
  "description": "Detailed description of what this object is, how it works, and what it's used for",
  "estimatedValue": "Rough price range if applicable (e.g. $20–50), or null if not applicable",
  "funFact": "One surprising, historical, or little-known fact about this object"
}

Rules:
- Be specific — "Sony WH-1000XM5 headphones" not just "headphones"
- description: 2–3 sentences covering purpose, how it works, and context
- estimatedValue: provide a market value estimate if it's a consumer product; null otherwise
- funFact: make it genuinely interesting and informative
- Output ONLY the JSON, nothing else`,
};

export function getSystemPrompt(useCase: string): string {
  return DEFAULT_PROMPTS[useCase];
}

const HF_REGEX = /registry:\/\/hf\/([^/]+\/[^/]+)\/(resolve|blob)\/([^/]+)\/(.+)/;

export function getHfDownloadUrl(modelSrc: string): string {
  const match = modelSrc.match(HF_REGEX);
  if (match) {
    return `https://huggingface.co/${match[1]}/resolve/${match[3]}/${match[4]}`;
  }
  return modelSrc;
}
