import type { Effort, Modality, ModelFeature, ModelKind } from '@harnesys/studio-shared';

export function toggleItem<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item];
}
export const MODALITY_ITEMS: {
  value: Modality;
  label: string;
}[] = [
  { value: 'text', label: 'Text' },
  { value: 'image', label: 'Image' },
  { value: 'audio', label: 'Audio' },
  { value: 'video', label: 'Video' },
  { value: 'file', label: 'File' },
];
export const FEATURE_ITEMS: {
  value: ModelFeature;
  label: string;
}[] = [
  { value: 'tools', label: 'Function Calling' },
  { value: 'structured', label: 'Structured Output' },
  { value: 'streaming', label: 'Streaming' },
  { value: 'reasoning', label: 'Reasoning' },
  { value: 'cache', label: 'Prompt Cache' },
];
export const EFFORT_ITEMS: {
  value: Effort;
  label: string;
}[] = [
  { value: 'none', label: 'None' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra High' },
  { value: 'max', label: 'Max' },
];
export const KIND_ITEMS: {
  value: ModelKind;
  label: string;
  hint: string;
}[] = [
  { value: 'chat', label: 'Chat', hint: 'Completions / agents' },
  { value: 'embed', label: 'Embedding', hint: 'Vector index / search' },
  { value: 'image', label: 'Image', hint: 'Image generation' },
  { value: 'audio', label: 'Audio', hint: 'Speech / audio' },
  { value: 'decision', label: 'Decision', hint: 'System One / structured choice' },
  { value: 'rerank', label: 'Rerank', hint: 'Document reranking' },
  { value: 'speech', label: 'Speech', hint: 'Text to speech' },
  { value: 'transcription', label: 'Transcription', hint: 'Speech to text' },
  { value: 'video', label: 'Video', hint: 'Video generation' },
];
