import type { ModelBinding } from 'harnesys';
import { resolveApiBaseUrl } from 'harnesys';
import type {
  ImageGenerationInput,
  ImageGenerationResult,
} from '../../domain/model-execution/image.port.ts';

const MULTIMODAL_GENERATION_PATH = '/services/aigc/multimodal-generation/generation';

interface DashScopeContentPart {
  image?: string;
}

interface DashScopeGenerationResponse {
  code?: string;
  message?: string;
  output?: {
    choices?: Array<{ message?: { content?: DashScopeContentPart[] } }>;
  };
}

export function dashScopeNativeBaseUrl(driver: string, apiUrl: string | undefined): string {
  const compatibleUrl = resolveApiBaseUrl(driver, apiUrl);
  if (compatibleUrl === undefined) {
    throw new Error('dashscope image generation requires an api url on the provider');
  }
  return `${new URL(compatibleUrl).origin}/api/v1`;
}

function firstImageUrl(payload: DashScopeGenerationResponse | undefined): string | undefined {
  for (const choice of payload?.output?.choices ?? []) {
    for (const part of choice.message?.content ?? []) {
      if (typeof part.image === 'string') {
        return part.image;
      }
    }
  }
  return undefined;
}

export async function generateDashScopeImage(
  binding: ModelBinding,
  input: ImageGenerationInput,
): Promise<ImageGenerationResult> {
  const url = `${dashScopeNativeBaseUrl(binding.driver, binding.apiUrl)}${MULTIMODAL_GENERATION_PATH}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...binding.headers,
      authorization: `Bearer ${binding.apiKey ?? ''}`,
      'content-type': 'application/json',
      connection: 'close',
    },
    body: JSON.stringify({
      model: binding.model.name,
      input: { messages: [{ role: 'user', content: [{ text: input.prompt }] }] },
      parameters: {
        ...(input.size === undefined ? {} : { size: input.size.replace('x', '*') }),
        ...(input.negativePrompt === undefined ? {} : { negative_prompt: input.negativePrompt }),
        ...(input.seed === undefined ? {} : { seed: input.seed }),
      },
    }),
  });
  const payload = (await response.json().catch(() => undefined)) as
    | DashScopeGenerationResponse
    | undefined;
  if (!response.ok || payload?.code !== undefined) {
    const reason = payload?.code ?? `http ${response.status}`;
    const detail = payload?.message === undefined ? '' : ` — ${payload.message}`;
    throw new Error(`dashscope image generation failed: ${reason}${detail}`);
  }
  const imageUrl = firstImageUrl(payload);
  if (imageUrl === undefined) {
    throw new Error('dashscope image generation returned no image');
  }
  const image = await fetch(imageUrl, { headers: { connection: 'close' } });
  if (!image.ok) {
    throw new Error(`dashscope image download failed: http ${image.status}`);
  }
  const bytes = new Uint8Array(await image.arrayBuffer());
  return {
    base64: Buffer.from(bytes).toString('base64'),
    mimeType: image.headers.get('content-type') ?? 'image/png',
  };
}
