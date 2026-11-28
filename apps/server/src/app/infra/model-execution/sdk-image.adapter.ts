import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { Injectable } from '@harnesys/brix';
import { generateImage } from 'ai';
import type { CapabilityMechanism, ModelBinding } from 'harnesys';
import { driverMechanism, imageCapabilities, resolveApiBaseUrl } from 'harnesys';
import type {
  ImageGenerationInput,
  ImageGenerationResult,
} from '../../domain/model-execution/image.port.ts';
import { assertImageInputSupported, ImagePort } from '../../domain/model-execution/image.port.ts';
import { UnsupportedCapabilityException } from '../../domain/model-execution/model-execution.error.ts';
import { generateDashScopeImage } from './dashscope-image.ts';

type ImageSizeFormat = `${number}x${number}`;

const NO_KEEPALIVE_HEADERS: Record<string, string> = { connection: 'close' };

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
    const mechanism = driverMechanism(binding.driver, 'image');
    if (mechanism === 'none') {
      throw new UnsupportedCapabilityException('image', binding.driver);
    }
    assertImageInputSupported(
      binding.model.name,
      imageCapabilities(binding.driver, binding.model.name),
      input,
    );
    if (mechanism === 'dashscope') {
      return generateDashScopeImage(binding, input);
    }
    const model = this.resolveImageModel(binding, mechanism);
    const result = await generateImage({
      model,
      prompt: input.prompt,
      ...sizeOption(input.size),
    });
    return { base64: result.image.base64, mimeType: result.image.mediaType };
  }

  private resolveImageModel(binding: ModelBinding, mechanism: CapabilityMechanism) {
    const baseURL = resolveApiBaseUrl(binding.driver, binding.apiUrl);
    if (mechanism === 'sdk') {
      return createOpenAI({
        apiKey: binding.apiKey,
        baseURL,
        headers: NO_KEEPALIVE_HEADERS,
      }).image(binding.model.name);
    }
    if (baseURL === undefined) {
      throw new UnsupportedCapabilityException('image', binding.driver);
    }
    return createOpenAICompatible({
      name: binding.driver,
      baseURL,
      apiKey: binding.apiKey,
      headers: { ...binding.headers, ...NO_KEEPALIVE_HEADERS },
    }).imageModel(binding.model.name);
  }
}
