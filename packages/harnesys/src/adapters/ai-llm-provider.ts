import { createAlibaba } from '@ai-sdk/alibaba';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMiniMax } from '@ai-sdk/minimax';
import { createMistral } from '@ai-sdk/mistral';
import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createXai } from '@ai-sdk/xai';
import pkg from '../../package.json' with { type: 'json' };
import {
  CEREBRAS_DEFAULT_URL,
  GROQ_DEFAULT_URL,
  NVIDIA_DEFAULT_URL,
  OLLAMA_CLOUD_DEFAULT_URL,
  OLLAMA_DEFAULT_URL,
  OPENROUTER_DEFAULT_URL,
  TOGETHER_DEFAULT_URL,
  ZAI_DEFAULT_URL,
} from '../constants.ts';
import type { ModelBinding } from '../ports/models.ts';

const APP_ID = 'Harnesys';
const APP_VERSION = pkg.version as string;

function withAppHeaders(
  headers: Record<string, string> | undefined,
  sessionId: string | undefined,
): Record<string, string> {
  const base: Record<string, string> = {
    'User-Agent': `${APP_ID.toLowerCase()}/${APP_VERSION}`,
    'X-Title': APP_ID,
  };
  if (sessionId !== undefined) {
    base['x-opencode-session'] = sessionId;
  }
  return { ...base, ...headers };
}

const REASONING_LEVELS = new Set([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'provider-default',
]);
const OPENAI_COMPATIBLE_DRIVERS = new Set([
  'openai-compatible',
  'xiaomi',
  'openrouter',
  'groq',
  'together',
  'cerebras',
  'nvidia',
  'zai',
  'ollama',
  'ollama-cloud',
]);
export interface GateModelInfo {
  architecture?: { input_modalities?: string[] };
}
export function mediaDeliveryGates(model: GateModelInfo): boolean {
  const modalities = model.architecture?.input_modalities;
  return !!modalities && modalities.map(String).includes('image');
}
export interface EffortStreamOptions {
  reasoning?: string;
  providerOptions?: Record<string, unknown>;
}
function reasoningOf(effort: string | undefined): string | undefined {
  if (!effort) {
    return undefined;
  }
  if (effort === 'max') {
    return 'xhigh';
  }
  return REASONING_LEVELS.has(effort) ? effort : undefined;
}
export function effortStreamOptions(
  binding: ModelBinding,
  effort: string | undefined,
): EffortStreamOptions {
  const out: EffortStreamOptions = {};
  const reasoning = reasoningOf(effort);
  if (reasoning !== undefined) {
    out.reasoning = reasoning;
  }
  if (effort === 'max' && OPENAI_COMPATIBLE_DRIVERS.has(binding.driver as string)) {
    out.providerOptions = { [binding.name]: { reasoningEffort: 'max' } };
  }
  return out;
}
function openAiCompatibleModel(
  binding: ModelBinding,
  headers: Record<string, string>,
  baseURL: string,
): (modelId: string) => unknown {
  return (modelId: string) =>
    createOpenAICompatible({
      baseURL,
      apiKey: binding.apiKey,
      headers,
      name: binding.name,
      includeUsage: true,
    } as never)(modelId);
}

export function buildProvider(
  binding: ModelBinding,
  sessionId?: string,
): (modelId: string) => unknown {
  const headers = withAppHeaders(binding.headers, sessionId);
  const opts = {
    apiKey: binding.apiKey,
    baseURL: binding.apiUrl,
    headers,
  };
  const driver = binding.driver as string;
  switch (driver) {
    case 'openai':
      return (m: string) => createOpenAI(opts as never)(m);
    case 'openai-compatible':
      return openAiCompatibleModel(binding, headers, binding.apiUrl ?? 'http://localhost');
    case 'anthropic':
      return (m: string) => createAnthropic(opts as never)(m);
    case 'google':
      return (m: string) => createGoogleGenerativeAI(opts as never)(m);
    case 'mistral':
      return (m: string) => createMistral(opts as never)(m);
    case 'xai':
      return (m: string) => createXai(opts as never)(m);
    case 'minimax':
      return (m: string) => createMiniMax(opts as never)(m);
    case 'alibaba':
    case 'qwen':
      return (m: string) => createAlibaba(opts as never)(m);
    case 'moonshotai':
    case 'moonshot':
    case 'kimi':
      return (m: string) => createMoonshotAI(opts as never)(m);
    case 'xiaomi':
      return openAiCompatibleModel(
        binding,
        headers,
        binding.apiUrl ?? 'https://api.xiaomimimo.com/v1',
      );
    case 'openrouter':
      return openAiCompatibleModel(binding, headers, binding.apiUrl ?? OPENROUTER_DEFAULT_URL);
    case 'groq':
      return openAiCompatibleModel(binding, headers, binding.apiUrl ?? GROQ_DEFAULT_URL);
    case 'together':
      return openAiCompatibleModel(binding, headers, binding.apiUrl ?? TOGETHER_DEFAULT_URL);
    case 'cerebras':
      return openAiCompatibleModel(binding, headers, binding.apiUrl ?? CEREBRAS_DEFAULT_URL);
    case 'nvidia':
      return openAiCompatibleModel(binding, headers, binding.apiUrl ?? NVIDIA_DEFAULT_URL);
    case 'zai':
      return openAiCompatibleModel(binding, headers, binding.apiUrl ?? ZAI_DEFAULT_URL);
    case 'ollama':
      return openAiCompatibleModel(
        binding,
        headers,
        ollamaChatBase(binding.apiUrl, OLLAMA_DEFAULT_URL),
      );
    case 'ollama-cloud':
      return openAiCompatibleModel(
        binding,
        headers,
        ollamaChatBase(binding.apiUrl, OLLAMA_CLOUD_DEFAULT_URL),
      );
    default:
      throw Object.assign(new Error(`unsupported driver ${driver}`), {
        code: 'model_unresolved',
      });
  }
}
function ollamaChatBase(apiUrl: string | undefined, fallback: string): string {
  const base = (apiUrl ?? fallback).replace(/\/+$/, '');
  return base.endsWith('/v1') ? base : `${base}/v1`;
}
