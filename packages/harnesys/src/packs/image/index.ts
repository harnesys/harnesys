import { definePack } from '../../domain/pack.ts';
import type { ImageGenerationPort } from '../../ports/image-generation.ts';
import type { ImageModelSelection } from './create-image-tools.ts';
import { createImageTools } from './create-image-tools.ts';

export interface ImageCapabilityPorts {
  image: ImageGenerationPort;
}

export const imageCapability = definePack<ImageCapabilityPorts, Record<string, unknown>>({
  name: 'image',
  version: '1.0.0',
  description: 'Image generation: image_generate',
  icon: 'image',
  specSchema: {
    type: 'object',
    properties: {
      provider: { type: 'string' },
      model: { type: 'string' },
    },
  },
  meta: {
    tools: [
      {
        name: 'image_generate',
        description:
          'Generate an image from a text prompt. Write a DETAILED ENGLISH prompt: subject, style, composition, lighting, mood. Returns a `thread:` locator (relPath) for the saved image artifact, which is also attached to the chat for the user.',
      },
    ],
    skills: [],
    hasSettings: true,
  },
  create: (ctx) => ({
    tools: createImageTools({
      image: ctx.ports.image,
      resolveScope: () => ctx.scope,
      modelSelection: modelSelectionOf(ctx.spec),
    }),
  }),
});

function modelSelectionOf(spec: Record<string, unknown>): ImageModelSelection {
  const provider = spec.provider;
  const model = spec.model;
  return typeof provider === 'string' &&
    provider !== '' &&
    typeof model === 'string' &&
    model !== ''
    ? { provider, model }
    : {};
}
