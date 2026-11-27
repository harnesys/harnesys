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

const GPT_IMAGE_SIZES: readonly string[] = ['1024x1024', '1024x1536', '1536x1024', 'auto'];
const DALL_E_3_SIZES: readonly string[] = ['1024x1024', '1024x1792', '1792x1024'];

export function supportedImageSizes(driver: string, model: string): readonly string[] | undefined {
  if (driverMechanism(driver, 'image') !== 'sdk') {
    return undefined;
  }
  if (model.startsWith('gpt-image')) {
    return GPT_IMAGE_SIZES;
  }
  if (model === 'dall-e-3') {
    return DALL_E_3_SIZES;
  }
  return undefined;
}

export function assertImageSizeSupported(
  driver: string,
  model: string,
  size: string | undefined,
): void {
  if (size === undefined) {
    return;
  }
  const supported = supportedImageSizes(driver, model);
  if (supported === undefined || supported.includes(size)) {
    return;
  }
  throw new Error(
    `image model ${model} does not support size "${size}", supported sizes: ${supported.join(' | ')}`,
  );
}

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
    assertImageSizeSupported(binding.driver, binding.model.name, input.size);
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
