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
// TEXT_FAST is the silent startup default (small, always available first).
export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: MODEL_KEYS.TEXT_FAST,
    name: 'Qwen · Fast',
    modelType: 'text',
    tagline: 'Fast, low-data text. Light on storage.',
    description: 'Lightweight general-purpose AI. Fast responses, low RAM. Good backup when storage is limited.',
    size: '1.1GB',
    sizeBytes: 1_056_782_912,
    modelSrc: QWEN3_1_7B_INST_Q4.src,
    supports: ['text'],
  },
  {
    id: MODEL_KEYS.TEXT_HEALTH,
    name: 'MedPsy',
    modelType: 'text',
    tagline: 'Health & nutrition specialist.',
    description: 'Knowledgeable, accurate, and runs fully on-device. Best for Scribe, Voice, and Deep.',
    size: '2.4GB',
    sizeBytes: 2_564_052_800,
    modelSrc: MEDGEMMA_4B_IT_Q4_1.src,
    supports: ['text', 'health'],
  },
  {
    id: MODEL_KEYS.VISION,
    name: 'SmolVLM2 · Vision',
    modelType: 'vision',
    tagline: 'On-device image understanding for Lens.',
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
  chat: `You are Peek's general AI assistant, running fully on-device and completely offline. Answer everyday questions clearly and concisely. You are a general assistant — not a document writer (that's Peek Scribe) or document analyst (that's Peek Deep). Just answer helpfully.`,
  scribe: `You are Peek Scribe, a private on-device document-writing assistant. Your sole purpose is to draft, edit, and produce complete, ready-to-use documents. You run fully offline and all files stay on the user's device. Do not use <think> tags. Do not reason before writing. Output the fenced code block immediately.

## Your output format — MANDATORY

Every time you produce a document, you MUST wrap the entire content in a fenced code block. The app reads this block, saves it as a real file, and opens a preview automatically. If you forget the fence, the file is not created and the user sees nothing useful.

### When to use Markdown (\`\`\`md)
Use \`\`\`md for: notes, reports, plans, outlines, essays, READMEs, meeting notes, to-do lists, resumes, cover letters, summaries, any text-based document.

Format:
\`\`\`md
# Document Title

Your full markdown content here...
\`\`\`

### When to use HTML (\`\`\`html)
Use \`\`\`html for: web pages, landing pages, portfolios, dashboards, forms, styled documents, anything that benefits from visual design or interactivity.

Format:
\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Title</title>
  <style>/* all CSS inline — no external dependencies */</style>
</head>
<body>
  <!-- full page content -->
</body>
</html>
\`\`\`

## Rules you must follow

1. **Output the complete content every time.** Never write "..." or "[rest of content here]" or truncate for brevity. The user needs a real, usable file — not a template or example.
2. **One fenced block per response.** Do not split the document across multiple blocks or messages.
3. **HTML must be fully self-contained.** All CSS goes in a \`<style>\` tag inside \`<head>\`. No external CDN links, no external fonts (use system fonts). The file will be opened offline.
4. **After the closing fence, write exactly one short sentence** describing what you created (e.g. "Created a two-page project plan with timeline and milestones."). Nothing else after that.
5. **Do not explain your formatting choices**, do not ask clarifying questions before writing, do not add disclaimers. Just write the document.
6. **If the user sends a document for editing**, rewrite it fully in the fenced block — do not output a diff or partial changes.
7. **Default to Markdown** unless the user explicitly asks for a web page, HTML, or something visual/styled.

## Decision guide (use this, do not deliberate)
- "write me a report / plan / notes / essay / outline" → \`\`\`md
- "make a web page / landing page / portfolio / dashboard" → \`\`\`html
- "edit this document" → same format as the input, fully rewritten
- "summarize this" → \`\`\`md (short document with key points)
- "make it look nice / styled" → \`\`\`html`,
  deep: `You are Peek Deep, a private on-device document analysis assistant. The user has loaded one or more local documents for private analysis.

Answer questions using ONLY the provided document context. If the answer is not in the documents, say so clearly — never fabricate information. Format responses in markdown with headers and bullet points where helpful.`,
  voice: `You are Peek Voice, a private on-device audio assistant. The user has provided a transcript of audio that was recorded or uploaded.

Explain or translate the key ideas from the transcript clearly and directly in 3–5 sentences. Write as flowing prose — no bullet points. Be informative and concise. Do not show reasoning steps.`,
  lens: `You are Peek Lens, a private on-device vision assistant. Analyze the image the user provides and answer their questions about it clearly and accurately. Describe what you see, identify objects, read text, or answer specific questions about the visual content.`,
  quickchat: `You are Peek, a fast private AI assistant running fully on-device. Keep answers concise and practical.`,
};

// ── Utility: strip <think>...</think> from visible output ──
export function stripThink(raw: string): { text: string; thinking: string } {
  let thinking = '';
  const text = raw.replace(/<think>([\s\S]*?)<\/think>/gi, (_, inner) => {
    thinking += inner.trim() + '\n';
    return '';
  }).trim();
  return { text, thinking: thinking.trim() };
}

// ── Utility: streaming-aware think split ─────────────────────
// Handles mid-stream unclosed <think> blocks so raw tags never
// appear in visible text and content after </think> is preserved.
export function splitStream(raw: string): { answer: string; thinking: string; inThink: boolean } {
  let thinking = '';
  let answer = raw;
  // Remove all complete <think>...</think> blocks first
  answer = answer.replace(/<think>([\s\S]*?)<\/think>/gi, (_, inner) => {
    thinking += inner.trim() + '\n';
    return '';
  });
  // Check for an unclosed <think> block (we're still inside it)
  const openIdx = answer.lastIndexOf('<think>');
  if (openIdx !== -1) {
    thinking += answer.slice(openIdx + 7);
    answer = answer.slice(0, openIdx);
    return { answer: answer.trim(), thinking: thinking.trim(), inThink: true };
  }
  return { answer: answer.trim(), thinking: thinking.trim(), inThink: false };
}

// ── Utility: detect fenced ```md or ```html block ──────────
// Uses lastIndexOf to correctly handle MD/HTML that contains inner
// code fences — lazy regex [\s\S]*? would cut off at the first ```.
export function detectArtifact(text: string): { type: 'html' | 'md'; source: string } | null {
  return extractFence(text, /```html\s*/i, 'html') ?? extractFence(text, /```(?:md|markdown)\s*/i, 'md');
}

function extractFence(text: string, openRe: RegExp, type: 'html' | 'md'): { type: 'html' | 'md'; source: string } | null {
  const openMatch = openRe.exec(text);
  if (!openMatch) return null;
  const contentStart = openMatch.index + openMatch[0].length;
  const rest = text.slice(contentStart);
  // Use lastIndexOf so inner ``` fences inside the content don't close us early
  const closeIdx = rest.lastIndexOf('```');
  const source = (closeIdx !== -1 ? rest.slice(0, closeIdx) : rest).trim();
  return source ? { type, source } : null;
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
