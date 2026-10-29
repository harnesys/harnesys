import { describe, expect, test } from 'bun:test';
import type { FileToolResult } from '../../application/tool-message.ts';
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

const ctx = { cwd: '/tmp', paths: { allow: [] }, agentId: 'agent-1' };

class FakeImageGenerationPort extends ImageGenerationPort {
  calls: Array<{ scope: CapabilityScope; request: ImageGenerationRequest }> = [];
  failure?: Error;

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
      path: 'attachments/att-1/cat.png',
    };
  }
}

describe('createImageTools', () => {
  test('generates image artifact with scope and prompt', async () => {
    const port = new FakeImageGenerationPort();
    const tool = createImageTools({ image: port, resolveScope: () => scope })[0];
    const result = (await tool?.execute({ prompt: 'a cat' }, ctx)) as FileToolResult;
    expect(result).toEqual({
      ok: true,
      relPath: 'thread:attachments/att-1/cat.png',
      attachmentId: 'att-1',
      name: 'cat.png',
      mediaType: 'image/png',
      kind: 'image',
    });
    expect(port.calls).toHaveLength(1);
    expect(port.calls[0]?.scope).toEqual(scope);
    expect(port.calls[0]?.request).toEqual({ prompt: 'a cat' });
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
});
