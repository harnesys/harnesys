import {
  ALIBABA_DEFAULT_URL,
  GROQ_DEFAULT_URL,
  MISTRAL_DEFAULT_URL,
  OPENROUTER_DEFAULT_URL,
  QWEN_DEFAULT_URL,
  TOGETHER_DEFAULT_URL,
  XIAOMI_DEFAULT_URL,
  ZAI_DEFAULT_URL,
} from '../constants.ts';
import type { ModelKind } from '../ports/models.ts';

export type CapabilityMechanism = 'sdk' | 'oai' | 'mistral' | 'dashscope' | 'none';

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
  alibaba: { image: 'dashscope' },
  qwen: { image: 'dashscope' },
};

export function driverMechanism(driver: string, kind: ModelKind): CapabilityMechanism {
  return DRIVER_CAPABILITIES[driver]?.[kind] ?? 'none';
}

export interface ImageParameterCapabilities {
  sizes: readonly string[];
  negativePrompt: boolean;
  seed: boolean;
}

const GPT_IMAGE_SIZES: readonly string[] = ['1024x1024', '1024x1536', '1536x1024', 'auto'];
const DALL_E_3_SIZES: readonly string[] = ['1024x1024', '1024x1792', '1792x1024'];

function sdkImageSizes(model: string): readonly string[] {
  if (model.startsWith('gpt-image')) {
    return GPT_IMAGE_SIZES;
  }
  if (model === 'dall-e-3') {
    return DALL_E_3_SIZES;
  }
  return [];
}

export function imageCapabilities(driver: string, model: string): ImageParameterCapabilities {
  const mechanism = driverMechanism(driver, 'image');
  if (mechanism === 'dashscope') {
    return { sizes: [], negativePrompt: true, seed: true };
  }
  if (mechanism === 'sdk') {
    return { sizes: sdkImageSizes(model), negativePrompt: false, seed: false };
  }
  return { sizes: [], negativePrompt: false, seed: false };
}

export const DRIVER_API_BASE_URLS: Record<string, string> = {
  openrouter: OPENROUTER_DEFAULT_URL,
  groq: GROQ_DEFAULT_URL,
  together: TOGETHER_DEFAULT_URL,
  zai: ZAI_DEFAULT_URL,
  xiaomi: XIAOMI_DEFAULT_URL,
  mistral: MISTRAL_DEFAULT_URL,
  alibaba: ALIBABA_DEFAULT_URL,
  qwen: QWEN_DEFAULT_URL,
};

export function resolveApiBaseUrl(driver: string, apiUrl: string | undefined): string | undefined {
  if (apiUrl !== undefined && apiUrl !== '') {
    return apiUrl;
  }
  return DRIVER_API_BASE_URLS[driver];
}
