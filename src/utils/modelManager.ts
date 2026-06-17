import {
  loadModel, unloadModel,
  WHISPER_EN_BASE_Q8_0, TTS_EN_SUPERTONIC_Q4_0,
} from '@qvac/sdk';
import { DownloadedModel } from '../types';

// Keeps the last LLM loaded in memory so screens don't reload every open
class LLMManager {
  private storageId: string | null = null;  // downloaded model ID
  private qvacId: string | null = null;     // qvac SDK model ID (returned by loadModel)
  private pending: Promise<string> | null = null;
  private pendingId: string | null = null;

  async ensure(
    model: DownloadedModel,
    modelConfig: Record<string, any>,
    onProgress?: (pct: number) => void,
  ): Promise<string> {
    // Already loaded — return immediately
    if (this.storageId === model.id && this.qvacId) {
      onProgress?.(100);
      return this.qvacId;
    }
    // Same model already loading — wait for it
    if (this.pendingId === model.id && this.pending) {
      return this.pending;
    }
    // Different model — unload current first
    if (this.qvacId) {
      await unloadModel({ modelId: this.qvacId }).catch(() => {});
      this.qvacId = null;
      this.storageId = null;
    }
    // Load the new model
    this.pendingId = model.id;
    this.pending = loadModel({
      modelSrc: model.modelSrc,
      modelType: 'llm',
      modelConfig,
      onProgress: (p: { percentage: number }) => onProgress?.(p.percentage),
    }).then(id => {
      this.qvacId = id;
      this.storageId = model.id;
      this.pending = null;
      this.pendingId = null;
      return id;
    }).catch(err => {
      this.pending = null;
      this.pendingId = null;
      throw err;
    });
    return this.pending;
  }

  isLoaded(storageModelId: string): boolean {
    return this.storageId === storageModelId && !!this.qvacId;
  }

  isPending(storageModelId: string): boolean {
    return this.pendingId === storageModelId && !!this.pending;
  }

  getQvacId(): string | null { return this.qvacId; }
  getLoadedModelId(): string | null { return this.storageId; }

  async release(): Promise<void> {
    if (this.qvacId) {
      await unloadModel({ modelId: this.qvacId }).catch(() => {});
    }
    this.qvacId = null;
    this.storageId = null;
    this.pending = null;
    this.pendingId = null;
  }
}

// Keeps descriptor-based models (Whisper, TTS) loaded for the whole session
class DescriptorModelManager {
  private descriptor: any;
  private qvacId: string | null = null;
  private pending: Promise<string> | null = null;

  constructor(descriptor: any) {
    this.descriptor = descriptor;
  }

  async ensure(): Promise<string> {
    if (this.qvacId) return this.qvacId;
    if (this.pending) return this.pending;

    this.pending = loadModel({ modelSrc: this.descriptor }).then(id => {
      this.qvacId = id;
      this.pending = null;
      return id;
    }).catch(err => {
      this.pending = null;
      throw err;
    });
    return this.pending;
  }

  getQvacId(): string | null { return this.qvacId; }
  isLoaded(): boolean { return !!this.qvacId; }
}

export const llmManager = new LLMManager();
export const whisperManager = new DescriptorModelManager(WHISPER_EN_BASE_Q8_0);
export const ttsManager = new DescriptorModelManager(TTS_EN_SUPERTONIC_Q4_0);
