import { Injectable } from '@harnesys/brix';
import { callModel, type ModelBinding } from 'harnesys';
import type {
  TextGenerationInput,
  TextGenerationResult,
} from '../../domain/model-execution/text.port.ts';
import { TextGenerationPort } from '../../domain/model-execution/text.port.ts';
import { ModelQuotaFactoryPort } from '../../domain/model-quota/model-quota-factory.port.ts';

@Injectable()
export class SdkTextAdapter extends TextGenerationPort {
  constructor(private readonly modelQuotaFactory?: ModelQuotaFactoryPort) {
    super();
  }

  async generate(binding: ModelBinding, input: TextGenerationInput): Promise<TextGenerationResult> {
    const quota =
      input.orgId === undefined ? undefined : this.modelQuotaFactory?.forOrg(input.orgId);
    const stream = callModel({
      binding,
      prompt: input.system ?? '',
      messages: [{ role: 'user', content: input.prompt }],
      toolNames: [],
      signalOrRegistry: undefined,
      ...(quota ? { quota } : {}),
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
