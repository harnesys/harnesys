export interface ModelUsage {
  model: string;
  modelId?: string;
  promptTokens: number;
  generatedTokens: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  images?: number;
  durationMs?: number;
}
