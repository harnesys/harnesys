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
    if (binding.driver === 'mistral') {
      return listMistralVoices(binding);
    }
    const voices = STATIC_VOICES[binding.driver];
    if (!voices) {
      throw new VoiceCatalogUnsupportedException(binding.driver);
    }
    return voices.map((id) => ({ id, name: id }));
  }
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
