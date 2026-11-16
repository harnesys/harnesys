import type { SpeechConfig, SpeechResponseFormat, SpeechVoice } from '@harnesys/studio-shared';
import { SPEECH_RESPONSE_FORMATS } from '@harnesys/studio-shared';
import { z } from 'zod';
import { optionalAmount } from './model-field-values';

export const speechVoiceSchema = z.object({
  name: z.string().trim(),
  id: z.string().trim(),
  params: z
    .string()
    .optional()
    .refine(
      (value) => value === undefined || value.trim() === '' || isStringRecord(value),
      'Must be a JSON object of string values',
    ),
});
export const speechSchema = z.object({
  responseFormat: z.union([z.enum(SPEECH_RESPONSE_FORMATS), z.literal('')]),
  voiceParam: z.string().trim(),
  sampleRate: optionalAmount,
  voices: z.array(speechVoiceSchema),
});
export interface SpeechVoiceFields {
  name: string;
  id: string;
  params: string;
}
export interface SpeechFields {
  responseFormat: '' | SpeechResponseFormat;
  voiceParam: string;
  sampleRate: string;
  voices: SpeechVoiceFields[];
}
export interface SpeechVoiceValues {
  name: string;
  id: string;
  params?: string;
}
export interface SpeechValues {
  responseFormat: '' | SpeechResponseFormat;
  voiceParam: string;
  sampleRate?: number;
  voices: SpeechVoiceValues[];
}
export function emptySpeechFields(): SpeechFields {
  return { responseFormat: '', voiceParam: '', sampleRate: '', voices: [] };
}
export function emptySpeechVoiceFields(): SpeechVoiceFields {
  return { name: '', id: '', params: '' };
}
export function speechFieldsFrom(config: SpeechConfig | undefined): SpeechFields {
  if (!config) {
    return emptySpeechFields();
  }
  return {
    responseFormat: config.responseFormat ?? '',
    voiceParam: config.voiceParam ?? '',
    sampleRate: config.sampleRate == null ? '' : String(config.sampleRate),
    voices: (config.voices ?? []).map((voice) => ({
      name: voice.name,
      id: voice.id,
      params:
        voice.params && Object.keys(voice.params).length > 0 ? JSON.stringify(voice.params) : '',
    })),
  };
}
export function toSpeechConfig(values: SpeechValues): SpeechConfig | undefined {
  const voices: SpeechVoice[] = values.voices
    .filter((voice) => voice.name !== '' && voice.id !== '')
    .map((voice) => {
      const params = parseStringRecord(voice.params);
      return params
        ? { name: voice.name, id: voice.id, params }
        : { name: voice.name, id: voice.id };
    });
  const config: SpeechConfig = {};
  if (values.responseFormat !== '') {
    config.responseFormat = values.responseFormat;
  }
  if (values.voiceParam !== '') {
    config.voiceParam = values.voiceParam;
  }
  if (values.sampleRate !== undefined) {
    config.sampleRate = values.sampleRate;
  }
  if (voices.length > 0) {
    config.voices = voices;
  }
  return Object.keys(config).length > 0 ? config : undefined;
}
function parseStringRecord(value: string | undefined): Record<string, string> | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  return parseJsonRecord(value);
}
function isStringRecord(value: string): boolean {
  return parseJsonRecord(value) !== undefined;
}
function parseJsonRecord(value: string): Record<string, string> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }
  for (const entry of Object.values(parsed)) {
    if (typeof entry !== 'string') {
      return undefined;
    }
  }
  return parsed as Record<string, string>;
}
export const SPEECH_FORMAT_ITEMS: {
  value: '' | SpeechResponseFormat;
  label: string;
}[] = [
  { value: '', label: 'Provider default' },
  ...SPEECH_RESPONSE_FORMATS.map((format) => ({
    value: format,
    label: format.toUpperCase(),
  })),
];
