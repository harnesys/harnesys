import { createOpenAI } from '@ai-sdk/openai';
import { Injectable } from '@harnesys/brix';
import { APICallError, generateSpeech } from 'ai';
import type {
  CapabilityMechanism,
  ModelBinding,
  SpeechConfig,
  SpeechResponseFormat,
  SpeechVoice,
} from 'harnesys';
import {
  DEFAULT_SPEECH_SAMPLE_RATE,
  DEFAULT_SPEECH_VOICE_PARAM,
  driverMechanism,
  resolveApiBaseUrl,
} from 'harnesys';
import {
  ModelProviderException,
  UnsupportedCapabilityException,
} from '../../domain/model-execution/model-execution.error.ts';
import type {
  SpeechSynthesisInput,
  SpeechSynthesisResult,
} from '../../domain/model-execution/speech.port.ts';
import { SpeechPort } from '../../domain/model-execution/speech.port.ts';

const SPEECH_MIME_TYPES: Record<SpeechResponseFormat, string> = {
  mp3: 'audio/mpeg',
  pcm: 'audio/pcm',
  wav: 'audio/wav',
  opus: 'audio/ogg',
  aac: 'audio/aac',
  flac: 'audio/flac',
};

// Only mistral needs a forced format; every other mechanism lets the provider
// pick its own default (OpenRouter defaults to pcm, an OpenAI server to mp3).
const DEFAULT_RESPONSE_FORMAT: Record<CapabilityMechanism, SpeechResponseFormat | undefined> = {
  sdk: undefined,
  oai: undefined,
  mistral: 'wav',
  none: undefined,
};

const DEFAULT_VOICE_PARAM: Record<CapabilityMechanism, string> = {
  sdk: 'voice',
  oai: DEFAULT_SPEECH_VOICE_PARAM,
  mistral: 'voice_id',
  none: DEFAULT_SPEECH_VOICE_PARAM,
};

const AUDIO_CONTENT_TYPES: Record<string, SpeechResponseFormat> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/pcm': 'pcm',
  'audio/l16': 'pcm',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'opus',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
};

interface SpeechContext {
  binding: ModelBinding;
  input: SpeechSynthesisInput;
  config: SpeechConfig;
  requestedFormat: SpeechResponseFormat | undefined;
  voice: SpeechVoice | undefined;
}

interface SynthesizedAudio {
  audio: Uint8Array;
  format: SpeechResponseFormat;
  sampleRate?: number;
}

@Injectable()
export class SdkSpeechAdapter extends SpeechPort {
  async synthesize(
    binding: ModelBinding,
    input: SpeechSynthesisInput,
  ): Promise<SpeechSynthesisResult> {
    const mechanism = driverMechanism(binding.driver, 'speech');
    const baseURL = resolveApiBaseUrl(binding.driver, binding.apiUrl);
    if (mechanism === 'none' || (mechanism !== 'sdk' && !baseURL)) {
      throw new UnsupportedCapabilityException('speech', binding.driver);
    }
    const config = binding.model.speech ?? {};
    const requestedFormat = config.responseFormat ?? DEFAULT_RESPONSE_FORMAT[mechanism];
    const voice = resolveVoice(input.voice, config.voices);
    const context: SpeechContext = { binding, input, config, requestedFormat, voice };
    const result =
      mechanism === 'sdk'
        ? await synthesizeViaSdk(context)
        : await synthesizeViaFetch(context, baseURL as string, mechanism);
    return finalizeAudio(result);
  }
}

function resolveVoice(
  requested: string | undefined,
  voices: SpeechVoice[] | undefined,
): SpeechVoice | undefined {
  if (!voices || voices.length === 0) {
    return requested ? { name: requested, id: requested } : undefined;
  }
  const match = requested
    ? voices.find((voice) => voice.id === requested || voice.name === requested)
    : undefined;
  return match ?? voices[0];
}

function buildRequestBody(
  context: SpeechContext,
  mechanism: CapabilityMechanism,
): Record<string, unknown> {
  const { config, input, voice, requestedFormat, binding } = context;
  const voiceParam = config.voiceParam?.trim() || DEFAULT_VOICE_PARAM[mechanism];
  const body: Record<string, unknown> = {
    model: binding.model.name,
    input: input.text,
  };
  if (requestedFormat !== undefined) {
    body.response_format = requestedFormat;
  }
  if (voice) {
    body[voiceParam] = voice.id;
    if (voice.params) {
      Object.assign(body, voice.params);
    }
  }
  return body;
}

function authHeaders(binding: ModelBinding): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(binding.apiKey ? { Authorization: `Bearer ${binding.apiKey}` } : {}),
    ...binding.headers,
  };
}

async function synthesizeViaSdk(context: SpeechContext): Promise<SynthesizedAudio> {
  const { binding, input, requestedFormat, voice } = context;
  const openai = createOpenAI({
    apiKey: binding.apiKey,
    baseURL: resolveApiBaseUrl(binding.driver, binding.apiUrl),
    headers: binding.headers,
  });
  try {
    const result = await generateSpeech({
      model: openai.speech(binding.model.name),
      text: input.text,
      ...(voice ? { voice: voice.id } : {}),
      ...(requestedFormat ? { outputFormat: requestedFormat } : {}),
    });
    return { audio: result.audio.uint8Array, format: requestedFormat ?? 'mp3' };
  } catch (error) {
    throw providerFailure(binding, error);
  }
}

async function synthesizeViaFetch(
  context: SpeechContext,
  baseURL: string,
  mechanism: CapabilityMechanism,
): Promise<SynthesizedAudio> {
  const { binding } = context;
  let response: Response;
  try {
    response = await fetch(`${baseURL}/audio/speech`, {
      method: 'POST',
      headers: authHeaders(binding),
      body: JSON.stringify(buildRequestBody(context, mechanism)),
    });
  } catch (error) {
    throw new ModelProviderException({
      driver: binding.driver,
      model: binding.model.name,
      body: error instanceof Error ? error.message : String(error),
    });
  }
  if (!response.ok) {
    throw new ModelProviderException({
      driver: binding.driver,
      model: binding.model.name,
      status: response.status,
      body: await response.text(),
    });
  }
  const contentType = response.headers.get('content-type');
  if (mechanism === 'mistral') {
    const raw = await response.text();
    const audioData = mistralAudioData(raw);
    if (audioData === undefined) {
      throw new ModelProviderException({
        driver: binding.driver,
        model: binding.model.name,
        status: response.status,
        body: raw,
      });
    }
    return {
      audio: new Uint8Array(Buffer.from(audioData, 'base64')),
      format: context.requestedFormat ?? 'wav',
    };
  }
  return {
    audio: new Uint8Array(await response.arrayBuffer()),
    format: responseFormat(contentType) ?? context.requestedFormat ?? 'mp3',
    sampleRate: contentTypeSampleRate(contentType),
  };
}

function mistralAudioData(raw: string): string | undefined {
  try {
    const data = JSON.parse(raw) as { audio_data?: unknown };
    return typeof data.audio_data === 'string' ? data.audio_data : undefined;
  } catch {
    return undefined;
  }
}

function responseFormat(contentType: string | null): SpeechResponseFormat | undefined {
  const mime = contentType?.split(';')[0]?.trim().toLowerCase();
  return mime ? AUDIO_CONTENT_TYPES[mime] : undefined;
}

function contentTypeSampleRate(contentType: string | null): number | undefined {
  const raw = contentTypeParam(contentType, ['rate', 'sample_rate', 'sample_rate_hz', 'rate_hz']);
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function contentTypeParam(contentType: string | null, names: string[]): string | undefined {
  if (!contentType) {
    return undefined;
  }
  for (const part of contentType.split(';').slice(1)) {
    const separator = part.indexOf('=');
    if (separator < 0) {
      continue;
    }
    const key = part.slice(0, separator).trim().toLowerCase();
    if (names.includes(key)) {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}

function providerFailure(binding: ModelBinding, error: unknown): ModelProviderException {
  if (APICallError.isInstance(error)) {
    return new ModelProviderException({
      driver: binding.driver,
      model: binding.model.name,
      status: error.statusCode,
      body: error.responseBody ?? error.message,
    });
  }
  return new ModelProviderException({
    driver: binding.driver,
    model: binding.model.name,
    body: error instanceof Error ? error.message : String(error),
  });
}

function finalizeAudio(result: SynthesizedAudio): SpeechSynthesisResult {
  if (result.format === 'pcm') {
    const sampleRate = result.sampleRate ?? DEFAULT_SPEECH_SAMPLE_RATE;
    return { audio: wrapPcmInWav(result.audio, sampleRate), mimeType: 'audio/wav' };
  }
  return { audio: result.audio, mimeType: SPEECH_MIME_TYPES[result.format] };
}

function wrapPcmInWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const channels = 1;
  const bitsPerSample = 16;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}
