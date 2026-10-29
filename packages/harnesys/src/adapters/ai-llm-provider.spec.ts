import { describe, expect, test } from 'bun:test';
import { streamText } from 'ai';
import type { ModelBinding } from '../ports/models.ts';
import { buildProvider, effortStreamOptions } from './ai-llm-provider.ts';

interface CapturedRequest {
  body: Record<string, unknown>;
}

const SSE_RESPONSE = [
  'data: ' +
    JSON.stringify({
      id: 'chatcmpl-test',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'test',
      choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: 'stop' }],
    }),
  'data: [DONE]',
].join('\n\n');

async function captureRequest(
  binding: ModelBinding,
  effort: string,
): Promise<Record<string, unknown>> {
  const captured: CapturedRequest[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    captured.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return new Response(SSE_RESPONSE, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  }) as typeof fetch;
  try {
    const provider = buildProvider(binding);
    const effortOptions = effortStreamOptions(binding, effort);
    const config: Record<string, unknown> = {
      model: provider(binding.model.name) as never,
      prompt: 'hi',
      maxRetries: 0,
    };
    if (effortOptions.reasoning !== undefined) {
      config.reasoning = effortOptions.reasoning;
    }
    if (effortOptions.providerOptions !== undefined) {
      config.providerOptions = effortOptions.providerOptions;
    }
    await streamText(config as never).consumeStream();
  } finally {
    globalThis.fetch = originalFetch;
  }
  expect(captured.length).toBe(1);
  return captured[0]?.body ?? {};
}

describe('effortStreamOptions wire format', () => {
  const zaiBinding: ModelBinding = {
    name: 'zai',
    driver: 'zai',
    apiKey: 'key',
    enabled: true,
    model: { name: 'glm-5.3-flash' },
  };

  test('effort max sends reasoning_effort max for zai', async () => {
    const body = await captureRequest(zaiBinding, 'max');
    expect(body.reasoning_effort).toBe('max');
  });

  test('effort low passes through for zai', async () => {
    const body = await captureRequest(zaiBinding, 'low');
    expect(body.reasoning_effort).toBe('low');
  });
});
