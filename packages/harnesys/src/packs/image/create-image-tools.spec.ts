import { describe, expect, test } from 'bun:test';
import type { FileToolResult } from '../../application/tool-message.ts';
import type { ImageParameterCapabilities } from '../../domain/driver-capabilities.ts';
import type { CapabilityScope } from '../../domain/pack.ts';
import type {
  GeneratedImageArtifact,
  ImageGenerationRequest,
} from '../../ports/image-generation.ts';
import { ImageGenerationPort } from '../../ports/image-generation.ts';
import { createImageTools } from './create-image-tools.ts';

const scope: CapabilityScope = {
  orgId: 'org-1',
  agentId: 'agent-1',
  sourceIds: [],
  threadId: 'thread-1',
};

const ctx = {
  cwd: '/data/thread',
  paths: { allow: [], threadDir: '/data/thread' },
  agentId: 'agent-1',
};

const BARE_CAPABILITIES: ImageParameterCapabilities = {
  sizes: [],
  negativePrompt: false,
  seed: false,
};

class FakeImageGenerationPort extends ImageGenerationPort {
  calls: Array<{ scope: CapabilityScope; request: ImageGenerationRequest }> = [];
  failure?: Error;
  caps: ImageParameterCapabilities = BARE_CAPABILITIES;

  async generate(
    scope: CapabilityScope,
    request: ImageGenerationRequest,
  ): Promise<GeneratedImageArtifact> {
    this.calls.push({ scope, request });
    if (this.failure) {
      throw this.failure;
    }
    return {
      attachmentId: 'att-1',
      name: 'cat.png',
      mediaType: 'image/png',
      kind: 'image',
      sizeBytes: 1234,
      path: 'attachments/att-1/cat.png',
    };
  }

  capabilities(): ImageParameterCapabilities {
    return this.caps;
  }
}

describe('createImageTools', () => {
  test('persists the absolute artifact path in a thread-rooted run', async () => {
    const port = new FakeImageGenerationPort();
    const tool = createImageTools({ image: port, resolveScope: () => scope })[0];
    const result = (await tool?.execute({ prompt: 'a cat' }, ctx)) as FileToolResult;
    expect(result).toEqual({
      ok: true,
      path: '/data/thread/attachments/att-1/cat.png',
      attachmentId: 'att-1',
      name: 'cat.png',
      mediaType: 'image/png',
      kind: 'image',
      sizeBytes: 1234,
    });
    expect(port.calls).toHaveLength(1);
    expect(port.calls[0]?.scope).toEqual(scope);
    expect(port.calls[0]?.request).toEqual({ prompt: 'a cat' });
  });

  test('a provider size rejection carries the omit-size escape hatch', async () => {
    const port = new FakeImageGenerationPort();
    port.failure = new Error("Image size '512x512' is not supported");
    const tool = createImageTools({ image: port, resolveScope: () => scope })[0];
    const result = (await tool?.execute({ prompt: 'a cat', size: '512x512' }, ctx)) as {
      error: string;
    };
    expect(result.error).toContain('omit size entirely to use the model default');
    expect(result.error).not.toContain('supported sizes:');
  });

  test('a provider size rejection lists the sizes the port knows', async () => {
    const port = new FakeImageGenerationPort();
    port.caps = {
      sizes: ['1024x1024', '1024x1536', '1536x1024', 'auto'],
      negativePrompt: false,
      seed: false,
    };
    port.failure = new Error("Image size '512x512' is not supported");
    const tool = createImageTools({ image: port, resolveScope: () => scope })[0];
    const result = (await tool?.execute({ prompt: 'a cat', size: '512x512' }, ctx)) as {
      error: string;
    };
    expect(result.error).toContain('supported sizes: 1024x1024 | 1024x1536 | 1536x1024 | auto');
    expect(result.error).toContain('omit size entirely to use the model default');
  });

  test('persists the absolute artifact path in an anchored run', async () => {
    const port = new FakeImageGenerationPort();
    const tool = createImageTools({ image: port, resolveScope: () => scope })[0];
    const result = (await tool?.execute(
      { prompt: 'a cat' },
      { ...ctx, cwd: '/srv/project' },
    )) as FileToolResult;
    expect(result.path).toBe('/data/thread/attachments/att-1/cat.png');
  });

  test('an upstream endpoint failure carries the image-model next step', async () => {
    const port = new FakeImageGenerationPort();
    port.failure = new Error('No endpoint found for model text-only/slug');
    const tool = createImageTools({ image: port, resolveScope: () => scope })[0];
    const result = (await tool?.execute({ prompt: 'a cat' }, ctx)) as { error: string };
    expect(result.error).toContain('No endpoint found for model text-only/slug');
    expect(result.error).toContain("switch the Image model in this agent's Image pack settings");
    expect(result.error).toContain('attach a provider model of kind Image on the Models page');
    expect(result.error).toContain('then retry');
  });

  test('returns error when port throws', async () => {
    const port = new FakeImageGenerationPort();
    port.failure = new Error('provider down');
    const tool = createImageTools({ image: port, resolveScope: () => scope })[0];
    const result = (await tool?.execute({ prompt: 'a cat' }, ctx)) as { error: string };
    expect(result).toEqual({ error: 'provider down' });
  });

  test('returns error on empty prompt', async () => {
    const port = new FakeImageGenerationPort();
    const tool = createImageTools({ image: port, resolveScope: () => scope })[0];
    const result = (await tool?.execute({ prompt: '' }, ctx)) as { error: string };
    expect(result).toEqual({ error: 'prompt is required' });
    expect(port.calls).toHaveLength(0);
  });

  test('merges pinned model selection into the request', async () => {
    const port = new FakeImageGenerationPort();
    const tool = createImageTools({
      image: port,
      resolveScope: () => scope,
      modelSelection: { provider: 'openai', model: 'gpt-image-1' },
    })[0];
    await tool?.execute({ prompt: 'a cat', size: '512x512' }, ctx);
    expect(port.calls[0]?.request).toEqual({
      prompt: 'a cat',
      size: '512x512',
      provider: 'openai',
      model: 'gpt-image-1',
    });
  });

  test('size parameter enumerates the sizes the port knows', () => {
    const port = new FakeImageGenerationPort();
    port.caps = {
      sizes: ['1024x1024', '1024x1536', '1536x1024', 'auto'],
      negativePrompt: false,
      seed: false,
    };
    const tool = createImageTools({ image: port, resolveScope: () => scope })[0];
    expect(tool?.input.properties?.size?.description).toBe(
      'Optional size, one of: 1024x1024 | 1024x1536 | 1536x1024 | auto',
    );
    expect(tool?.input.properties?.size?.enum).toEqual([
      '1024x1024',
      '1024x1536',
      '1536x1024',
      'auto',
    ]);
  });

  test('size parameter falls back to provider-dependent wording when the port is silent', () => {
    const port = new FakeImageGenerationPort();
    const tool = createImageTools({ image: port, resolveScope: () => scope })[0];
    expect(tool?.input.properties?.size?.description).toBe(
      'Optional size as WIDTHxHEIGHT, e.g. 1024x1024 (provider-dependent; an unsupported size fails with the provider error — omit it to use the model default)',
    );
    expect(tool?.input.properties?.size?.enum).toBeUndefined();
  });

  test('mechanism-carried parameters appear in the schema and reach the port', async () => {
    const port = new FakeImageGenerationPort();
    port.caps = { sizes: [], negativePrompt: true, seed: true };
    const tool = createImageTools({ image: port, resolveScope: () => scope })[0];
    expect(tool?.input.properties?.negativePrompt?.type).toBe('string');
    expect(tool?.input.properties?.seed?.type).toBe('integer');
    await tool?.execute({ prompt: 'a cat', negativePrompt: 'blurry', seed: 7 }, ctx);
    expect(port.calls[0]?.request).toEqual({
      prompt: 'a cat',
      negativePrompt: 'blurry',
      seed: 7,
    });
  });

  test('parameters the mechanism does not carry stay out of the schema', () => {
    const port = new FakeImageGenerationPort();
    const tool = createImageTools({ image: port, resolveScope: () => scope })[0];
    expect(tool?.input.properties?.negativePrompt).toBeUndefined();
    expect(tool?.input.properties?.seed).toBeUndefined();
  });
});
