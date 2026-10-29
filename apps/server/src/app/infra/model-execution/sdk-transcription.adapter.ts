import { createOpenAI } from '@ai-sdk/openai';
import { Injectable } from '@harnesys/brix';
import { transcribe } from 'ai';
import type { ModelBinding } from 'harnesys';
import { driverMechanism, resolveApiBaseUrl } from 'harnesys';
import { UnsupportedCapabilityException } from '../../domain/model-execution/model-execution.error.ts';
import type {
  TranscriptionInput,
  TranscriptionResult,
} from '../../domain/model-execution/transcription.port.ts';
import { TranscriptionPort } from '../../domain/model-execution/transcription.port.ts';

@Injectable()
export class SdkTranscriptionAdapter extends TranscriptionPort {
  async transcribe(binding: ModelBinding, input: TranscriptionInput): Promise<TranscriptionResult> {
    const mechanism = driverMechanism(binding.driver, 'transcription');
    const baseURL = resolveApiBaseUrl(binding.driver, binding.apiUrl);
    if (mechanism === 'none' || (mechanism !== 'sdk' && !baseURL)) {
      throw new UnsupportedCapabilityException('transcription', binding.driver);
    }
    const openai = createOpenAI({
      apiKey: binding.apiKey,
      baseURL,
      headers: binding.headers,
    });
    const result = await transcribe({
      model: openai.transcription(binding.model.name),
      audio: input.audioBase64,
    });
    return { text: result.text, durationInSeconds: result.durationInSeconds };
  }
}
