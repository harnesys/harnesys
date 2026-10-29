import {
  GROQ_DEFAULT_URL,
  MISTRAL_DEFAULT_URL,
  OPENROUTER_DEFAULT_URL,
  TOGETHER_DEFAULT_URL,
  XIAOMI_DEFAULT_URL,
  ZAI_DEFAULT_URL,
} from '../constants.ts';
import type { ModelKind } from '../ports/models.ts';

export type CapabilityMechanism = 'sdk' | 'oai' | 'mistral' | 'none';

export const DRIVER_CAPABILITIES: Record<
  string,
  Partial<Record<ModelKind, CapabilityMechanism>>
> = {
  openai: { image: 'sdk', speech: 'sdk', transcription: 'sdk' },
  'openai-compatible': { image: 'oai', speech: 'oai', transcription: 'oai' },
  openrouter: { image: 'oai', speech: 'oai', transcription: 'oai' },
  groq: { speech: 'oai', transcription: 'oai' },
  together: { image: 'oai' },
  zai: { image: 'oai', speech: 'oai', transcription: 'oai' },
  xiaomi: { speech: 'oai', transcription: 'oai' },
  mistral: { speech: 'mistral', transcription: 'oai' },
};

export function driverMechanism(driver: string, kind: ModelKind): CapabilityMechanism {
  return DRIVER_CAPABILITIES[driver]?.[kind] ?? 'none';
}

export const DRIVER_API_BASE_URLS: Record<string, string> = {
  openrouter: OPENROUTER_DEFAULT_URL,
  groq: GROQ_DEFAULT_URL,
  together: TOGETHER_DEFAULT_URL,
  zai: ZAI_DEFAULT_URL,
  xiaomi: XIAOMI_DEFAULT_URL,
  mistral: MISTRAL_DEFAULT_URL,
};

export function resolveApiBaseUrl(driver: string, apiUrl: string | undefined): string | undefined {
  if (apiUrl !== undefined && apiUrl !== '') {
    return apiUrl;
  }
  return DRIVER_API_BASE_URLS[driver];
}
