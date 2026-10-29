import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { Injectable } from '@harnesys/brix';
import { generateImage } from 'ai';
import type { ModelBinding } from 'harnesys';
import { driverMechanism, resolveApiBaseUrl } from 'harnesys';
import type {
  ImageGenerationInput,
  ImageGenerationResult,
} from '../../domain/model-execution/image.port.ts';
import { ImagePort } from '../../domain/model-execution/image.port.ts';
import { UnsupportedCapabilityException } from '../../domain/model-execution/model-execution.error.ts';

type ImageSizeFormat = `${number}x${number}`;

function sizeOption(size: string | undefined): { size?: ImageSizeFormat } {
  if (size === undefined) {
    return {};
  }
  return { size: size as ImageSizeFormat };
}

@Injectable()
export class SdkImageAdapter extends ImagePort {
  async generate(
    binding: ModelBinding,
    input: ImageGenerationInput,
  ): Promise<ImageGenerationResult> {
    const model = this.resolveImageModel(binding);
    const result = await generateImage({
      model,
      prompt: input.prompt,
      ...sizeOption(input.size),
    });
    return { base64: result.image.base64, mimeType: result.image.mediaType };
  }

  private resolveImageModel(binding: ModelBinding) {
    const mechanism = driverMechanism(binding.driver, 'image');
    const baseURL = resolveApiBaseUrl(binding.driver, binding.apiUrl);
    if (mechanism === 'none') {
      throw new UnsupportedCapabilityException('image', binding.driver);
    }
    if (mechanism === 'sdk') {
      return createOpenAI({
        apiKey: binding.apiKey,
        baseURL,
      }).image(binding.model.name);
    }
    if (baseURL === undefined) {
      throw new UnsupportedCapabilityException('image', binding.driver);
    }
    return createOpenAICompatible({
      name: binding.driver,
      baseURL,
      apiKey: binding.apiKey,
      headers: binding.headers,
    }).imageModel(binding.model.name);
  }
}
