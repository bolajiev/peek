import { ragIngest, ragSearch, ragCloseWorkspace } from '@qvac/sdk';
import AsyncStorage from '@react-native-async-storage/async-storage';

const WORKSPACE = 'peek-memory';
const DOC_COUNT_KEY = '@peek_rag_docs';

export async function getRagDocCount(): Promise<number> {
  const val = await AsyncStorage.getItem(DOC_COUNT_KEY);
  return val ? parseInt(val, 10) : 0;
}

async function bumpDocCount(): Promise<void> {
  const current = await getRagDocCount();
  await AsyncStorage.setItem(DOC_COUNT_KEY, String(current + 1));
}

export async function ragIngestText(
  embeddingModelId: string,
  text: string,
  onProgress?: (pct: number) => void
): Promise<void> {
  await ragIngest({
    modelId: embeddingModelId,
    documents: [text],
    workspace: WORKSPACE,
    chunk: true,
    chunkOpts: { chunkSize: 256, chunkOverlap: 32 },
    onProgress: (stage, current, total) => {
      if (onProgress && total > 0) onProgress(Math.round((current / total) * 100));
    },
  });
  await bumpDocCount();
}

export async function ragQuery(
  embeddingModelId: string,
  query: string,
  topK = 3
): Promise<string[]> {
  try {
    const results = await ragSearch({
      modelId: embeddingModelId,
      query,
      topK,
      workspace: WORKSPACE,
    });
    return results.map((r) => r.content).filter(Boolean);
  } catch {
    return [];
  }
}

export async function closeRagWorkspace(): Promise<void> {
  await ragCloseWorkspace({ workspace: WORKSPACE }).catch(() => {});
}

export function buildRagContext(docs: string[]): string {
  if (docs.length === 0) return '';
  return `\n\nRelevant context from the user's personal knowledge base:\n${docs.map((d, i) => `[${i + 1}] ${d}`).join('\n')}\n`;
}
