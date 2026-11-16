import { Injectable } from '@harnesys/brix';
import type { ModelBinding } from 'harnesys';
import { resolveApiBaseUrl } from 'harnesys';
import { VoiceCatalogUnsupportedException } from '../../domain/model-execution/model-execution.error.ts';
import type { VoiceOption } from '../../domain/model-execution/voice-catalog.port.ts';
import { VoiceCatalogPort } from '../../domain/model-execution/voice-catalog.port.ts';

const OPENAI_VOICES = [
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'onyx',
  'nova',
  'sage',
  'shimmer',
  'verse',
];

const GROQ_VOICES = [
  'Aaliyah-PlayAI',
  'Adina-PlayAI',
  'Amber-PlayAI',
  'Angeline-PlayAI',
  'Aurora-PlayAI',
  'Ava-PlayAI',
  'Briggs-PlayAI',
  'Calum-PlayAI',
  'Celeste-PlayAI',
  'Cheyanne-PlayAI',
  'Chip-PlayAI',
  'Cillian-PlayAI',
  'Deedee-PlayAI',
  'Fritz-PlayAI',
  'Gail-PlayAI',
  'Indigo-PlayAI',
  'Judith-PlayAI',
  'Mamaw-PlayAI',
  'Mason-PlayAI',
  'Mikail-PlayAI',
  'Mitch-PlayAI',
  'Quinn-PlayAI',
  'Thunder-PlayAI',
];

const ZAI_VOICES = ['tongtong', 'chuichui', 'xiaochen', 'jam', 'kazi', 'douji', 'luodo'];

const STATIC_VOICES: Record<string, string[]> = {
  openai: OPENAI_VOICES,
  groq: GROQ_VOICES,
  zai: ZAI_VOICES,
};

@Injectable()
export class SdkVoiceCatalogAdapter extends VoiceCatalogPort {
  async list(binding: ModelBinding): Promise<VoiceOption[]> {
    const configured = binding.model.speech?.voices;
    if (configured && configured.length > 0) {
      return configured.map((voice) => ({ id: voice.id, name: voice.name }));
    }
    if (binding.driver === 'mistral') {
      return listMistralVoices(binding);
    }
    if (binding.driver === 'openrouter') {
      return listOpenRouterVoices(binding);
    }
    const voices = STATIC_VOICES[binding.driver];
    if (!voices) {
      throw new VoiceCatalogUnsupportedException(binding.driver);
    }
    return voices.map((id) => ({ id, name: id }));
  }
}

interface OpenRouterModelRecord {
  id?: unknown;
  canonical_slug?: unknown;
  supported_voices?: unknown;
}

async function listOpenRouterVoices(binding: ModelBinding): Promise<VoiceOption[]> {
  const baseURL = resolveApiBaseUrl(binding.driver, binding.apiUrl);
  const response = await fetch(`${baseURL}/models?output_modalities=speech`, {
    headers: {
      ...(binding.apiKey ? { Authorization: `Bearer ${binding.apiKey}` } : {}),
      ...binding.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`openrouter voices failed (${response.status})`);
  }
  const data = (await response.json()) as { data?: unknown };
  if (!Array.isArray(data.data)) {
    throw new Error('openrouter models response has no data array');
  }
  const model = findOpenRouterModel(data.data, binding.model.name);
  const supported = model?.supported_voices;
  if (!Array.isArray(supported) || supported.length === 0) {
    throw new VoiceCatalogUnsupportedException(binding.driver);
  }
  return supported.flatMap((voice) =>
    typeof voice === 'string' && voice !== '' ? [{ id: voice, name: voice }] : [],
  );
}

function findOpenRouterModel(items: unknown[], name: string): OpenRouterModelRecord | undefined {
  const records = items.filter(
    (item): item is OpenRouterModelRecord => typeof item === 'object' && item !== null,
  );
  return (
    records.find((record) => record.id === name) ??
    records.find((record) => record.canonical_slug === name) ??
    records.find(
      (record) =>
        typeof record.id === 'string' && stripModelVariant(record.id) === stripModelVariant(name),
    )
  );
}

function stripModelVariant(id: string): string {
  return id.split(':')[0] ?? id;
}

interface MistralVoiceRecord {
  name?: unknown;
  slug?: unknown;
}

async function listMistralVoices(binding: ModelBinding): Promise<VoiceOption[]> {
  const baseURL = resolveApiBaseUrl(binding.driver, binding.apiUrl);
  const response = await fetch(`${baseURL}/audio/voices?type=preset&limit=100`, {
    headers: {
      Authorization: `Bearer ${binding.apiKey}`,
      ...binding.headers,
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`mistral voices failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  const data = (await response.json()) as { items?: MistralVoiceRecord[] };
  if (!Array.isArray(data.items)) {
    throw new Error('mistral voices response has no items array');
  }
  return data.items.flatMap((voice) => {
    if (typeof voice.slug !== 'string' || voice.slug === '' || typeof voice.name !== 'string') {
      return [];
    }
    return [{ id: voice.slug, name: voice.name }];
  });
}
