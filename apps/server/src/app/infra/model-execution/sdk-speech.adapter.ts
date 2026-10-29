import { createOpenAI } from '@ai-sdk/openai';
import { Injectable } from '@harnesys/brix';
import { generateSpeech } from 'ai';
import type { ModelBinding } from 'harnesys';
import { driverMechanism, resolveApiBaseUrl } from 'harnesys';
import { UnsupportedCapabilityException } from '../../domain/model-execution/model-execution.error.ts';
import type {
  SpeechSynthesisInput,
  SpeechSynthesisResult,
} from '../../domain/model-execution/speech.port.ts';
import { SpeechPort } from '../../domain/model-execution/speech.port.ts';

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
    if (mechanism === 'mistral') {
      if (!baseURL) {
        throw new UnsupportedCapabilityException('speech', binding.driver);
      }
      return synthesizeMistral(binding, input, baseURL);
    }
    const openai = createOpenAI({
      apiKey: binding.apiKey,
      baseURL,
      headers: binding.headers,
    });
    const result = await generateSpeech({
      model: openai.speech(binding.model.name),
      text: input.text,
      voice: input.voice,
    });
    return { audio: result.audio.uint8Array, mimeType: result.audio.mediaType };
  }
}

const DEFAULT_MISTRAL_VOICE = 'gb_jane_neutral';

async function synthesizeMistral(
  binding: ModelBinding,
  input: SpeechSynthesisInput,
  baseURL: string,
): Promise<SpeechSynthesisResult> {
  const response = await fetch(`${baseURL}/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${binding.apiKey}`,
      ...binding.headers,
    },
    body: JSON.stringify({
      model: binding.model.name,
      input: input.text,
      voice_id: input.voice ?? DEFAULT_MISTRAL_VOICE,
      response_format: 'wav',
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `mistral speech failed (${response.status}) model=${binding.model.name} voice_id=${input.voice ?? DEFAULT_MISTRAL_VOICE}: ${detail.slice(0, 300)}`,
    );
  }
  const data = (await response.json()) as { audio_data?: unknown };
  if (typeof data.audio_data !== 'string') {
    throw new Error('mistral speech response has no audio_data');
  }
  return { audio: new Uint8Array(Buffer.from(data.audio_data, 'base64')), mimeType: 'audio/wav' };
}
