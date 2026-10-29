import { DRIVERS } from '../constants.ts';

export { DRIVERS };
export type Driver = (typeof DRIVERS)[number];
export type ModelOrigin = 'local' | 'remote';
export interface ModelPricingOverride {
  minPromptTokens: number;
  prompt?: string;
  completion?: string;
  input_cache_read?: string;
  input_cache_write?: string;
  image?: string;
  request?: string;
}
export interface ModelPricing {
  prompt: string;
  completion: string;
  image?: string;
  request?: string;
  input_cache_read?: string;
  input_cache_write?: string;
  overrides?: ModelPricingOverride[];
}
export interface ModelArchitecture {
  modality?: string;
  input_modalities?: string[];
  output_modalities?: string[];
  tokenizer?: string;
  instruct_type?: string | null;
}
export interface ModelTopProvider {
  context_length?: number;
  max_completion_tokens?: number;
  is_moderated?: boolean;
}
export const MODEL_KINDS = [
  'chat',
  'embed',
  'image',
  'audio',
  'decision',
  'rerank',
  'speech',
  'transcription',
  'video',
] as const;
export type ModelKind = (typeof MODEL_KINDS)[number];
export const SUPPORTED_MODEL_KINDS = [
  'chat',
  'embed',
  'decision',
  'image',
  'speech',
  'transcription',
] as const;
export function isModelKind(value: unknown): value is ModelKind {
  return typeof value === 'string' && (MODEL_KINDS as readonly string[]).includes(value);
}
export function isModelKindSupported(kind: ModelKind): boolean {
  return (SUPPORTED_MODEL_KINDS as readonly string[]).includes(kind);
}
const MEDIA_MODALITY_KINDS = [
  ['image', 'image'],
  ['audio', 'audio'],
  ['video', 'video'],
  ['speech', 'speech'],
  ['transcription', 'transcription'],
  ['rerank', 'rerank'],
] as const;
export function modelKindFromOutputModalities(outputs: readonly unknown[] | undefined): ModelKind {
  const set = new Set((outputs ?? []).map(String));
  if (set.has('embeddings')) {
    return 'embed';
  }
  if (set.has('decisions')) {
    return 'decision';
  }
  for (const [modality, kind] of MEDIA_MODALITY_KINDS) {
    if (set.has(modality)) {
      return kind;
    }
  }
  return 'chat';
}
export interface ModelFields {
  id?: string;
  name?: string;
  description?: string;
  kind?: ModelKind;
  context_length?: number;
  architecture?: ModelArchitecture;
  pricing?: ModelPricing;
  top_provider?: ModelTopProvider;
  supported_parameters?: string[];
  effort?: string[];
  defaultEffort?: string;
  reasoningMandatory?: boolean;
}
export type ModelRecord = ModelFields & {
  name: string;
  origin?: ModelOrigin;
  host?: ModelFields;
};
export type ResolvedModel = ModelFields & {
  name: string;
  origin?: ModelOrigin;
};
export interface ProviderConfig {
  name: string;
  driver: string;
  apiKey?: string;
  apiUrl?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  models: ModelRecord[];
}
export interface ModelBinding {
  name: string;
  driver: Driver;
  apiUrl?: string;
  headers?: Record<string, string>;
  apiKey?: string;
  enabled: boolean;
  model: ResolvedModel;
}
export type DiscoveredModel = ModelFields & {
  name: string;
  deprecated?: boolean;
  raw?: unknown;
};
export type FetchLike = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;
export interface DiscoverInput {
  driver: string;
  apiKey?: string;
  apiUrl?: string;
  headers?: Record<string, string>;
  fetch?: FetchLike;
}
export interface ModelsPort {
  get: (provider: string, name: string) => Promise<ModelBinding>;
}
export type ModelsApi = ModelsPort & {
  discover: (input: DiscoverInput) => Promise<DiscoveredModel[]>;
};
export function normalizeProvider(provider: ProviderConfig): ProviderConfig {
  return {
    ...provider,
    enabled: provider.enabled !== false,
    models: provider.models.map((m) => ({ ...m })),
  };
}
export function resolveModel(record: ModelRecord): ResolvedModel {
  const { host, ...rest } = record;
  return {
    ...(host ?? {}),
    ...rest,
    name: record.name,
    origin: record.origin,
  };
}
