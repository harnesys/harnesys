import { Injectable } from '@harnesys/brix';
import { OLLAMA_CLOUD_DEFAULT_URL, OLLAMA_DEFAULT_URL } from 'harnesys';
import { LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { ProviderValidationException } from '../../domain/provider/provider.error.ts';
import { requireProvider } from './provider.helpers.ts';
import { ProviderKeys } from './provider-keys.ts';

export interface OllamaModelInfoRequest {
  orgId: string;
  providerId: string;
  name: string;
}
export interface OllamaThinkingInfo {
  values: Array<string | boolean>;
  default?: string | boolean;
}
export interface OllamaModelInfo {
  context_length?: number;
  capabilities: string[];
  thinking?: OllamaThinkingInfo;
  parameter_size?: string;
  quantization_level?: string;
}
const OLLAMA_DRIVERS = new Set(['ollama', 'ollama-cloud']);

@Injectable()
export class OllamaModelInfoUseCase {
  constructor(
    private readonly providers: LlmProviderPort,
    private readonly keys: ProviderKeys,
  ) {}

  async execute(request: OllamaModelInfoRequest): Promise<OllamaModelInfo> {
    const provider = requireProvider(this.providers, request.orgId, request.providerId);
    if (!OLLAMA_DRIVERS.has(provider.driver)) {
      throw new ProviderValidationException(
        'autofill from Ollama is only available for ollama providers',
      );
    }
    const fallback =
      provider.driver === 'ollama-cloud' ? OLLAMA_CLOUD_DEFAULT_URL : OLLAMA_DEFAULT_URL;
    const base = (provider.apiUrl ?? fallback).replace(/\/v1\/?$/, '');
    const apiKey = await this.keys.resolveApiKey(request.orgId, provider.id, provider.apiKey);
    const response = await fetch(`${base}/api/show`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ model: request.name }),
    });
    if (!response.ok) {
      throw new ProviderValidationException(
        `Ollama returned HTTP ${response.status} for /api/show`,
      );
    }
    console.log(await response.json());
    return parseOllamaShow(await response.json());
  }
}

function parseOllamaShow(json: unknown): OllamaModelInfo {
  const record = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  const modelInfo =
    record.model_info && typeof record.model_info === 'object'
      ? (record.model_info as Record<string, unknown>)
      : {};
  let contextLength: number | undefined;
  for (const [key, value] of Object.entries(modelInfo)) {
    if (key.endsWith('.context_length') && typeof value === 'number' && Number.isFinite(value)) {
      contextLength = value;
      break;
    }
  }
  const capabilities = Array.isArray(record.capabilities)
    ? record.capabilities.filter((item): item is string => typeof item === 'string')
    : [];
  const thinking = parseOllamaThinking(record.thinking);
  const details =
    record.details && typeof record.details === 'object'
      ? (record.details as Record<string, unknown>)
      : {};
  const parameterSize = asNonEmptyString(details.parameter_size);
  const quantizationLevel = asNonEmptyString(details.quantization_level);
  return {
    context_length: contextLength,
    capabilities,
    thinking,
    parameter_size: parameterSize,
    quantization_level: quantizationLevel,
  };
}
function parseOllamaThinking(raw: unknown): OllamaThinkingInfo | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  const values = Array.isArray(record.values)
    ? record.values.filter(
        (item): item is string | boolean => typeof item === 'string' || typeof item === 'boolean',
      )
    : [];
  if (values.length === 0) {
    return undefined;
  }
  const fallbackDefault =
    typeof record.default === 'string' || typeof record.default === 'boolean'
      ? record.default
      : undefined;
  return { values, default: fallbackDefault };
}
function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}
