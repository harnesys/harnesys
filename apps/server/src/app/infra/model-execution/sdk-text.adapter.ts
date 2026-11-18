import { Injectable } from '@harnesys/brix';
import { callModel, type ModelBinding } from 'harnesys';
import type {
  TextGenerationInput,
  TextGenerationResult,
} from '../../domain/model-execution/text.port.ts';
import { TextGenerationPort } from '../../domain/model-execution/text.port.ts';

@Injectable()
export class SdkTextAdapter extends TextGenerationPort {
  async generate(binding: ModelBinding, input: TextGenerationInput): Promise<TextGenerationResult> {
    const stream = callModel({
      binding,
      prompt: input.system ?? '',
      messages: [{ role: 'user', content: input.prompt }],
      toolNames: [],
      signalOrRegistry: undefined,
      ...(input.maxOutputTokens !== undefined
        ? { settings: { generation: { maxTokens: input.maxOutputTokens } } }
        : {}),
    });
    let text = '';
    for await (const chunk of stream) {
      if (chunk.type === 'completed') {
        text = chunk.text ?? '';
      }
    }
    return { text };
  }
}
