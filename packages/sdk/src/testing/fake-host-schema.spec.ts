import { describe, expect, test } from 'bun:test';
import { defineAddon } from '../define-addon.ts';
import { createFakeHost } from './fake-host.ts';
import { toolPackManifest } from './fixtures.ts';

const manifest = toolPackManifest([
  {
    name: 'example.ping',
    description: 'Ping',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: { pong: { type: 'boolean' } },
      required: ['pong'],
      additionalProperties: false,
    },
    effect: 'read',
  },
]);

describe('fake host tool schema validation', () => {
  test('valid input and output pass the declared schemas', async () => {
    const host = createFakeHost({
      definition: defineAddon({ tools: { 'example.ping': async () => ({ pong: true }) } }),
      manifest,
    });
    const result = await host.callTool('example', 'example.ping', { url: 'https://example.com' });
    expect(result.output).toEqual({ pong: true });
    host.close();
  });

  test('input violating inputSchema is invalid_params and never reaches the handler', async () => {
    let called = false;
    const host = createFakeHost({
      definition: defineAddon({
        tools: {
          'example.ping': async () => {
            called = true;
            return { pong: true };
          },
        },
      }),
      manifest,
    });
    await expect(host.callTool('example', 'example.ping', { wrong: true })).rejects.toMatchObject({
      reason: 'invalid_params',
    });
    await expect(
      host.callTool('example', 'example.ping', { url: 'https://example.com', extra: 1 }),
    ).rejects.toMatchObject({ reason: 'invalid_params' });
    expect(called).toBe(false);
    host.close();
  });

  test('output violating outputSchema is invalid_response', async () => {
    const host = createFakeHost({
      definition: defineAddon({
        tools: { 'example.ping': async () => ({ pong: 'not-a-boolean', missing: true }) },
      }),
      manifest,
    });
    await expect(
      host.callTool('example', 'example.ping', { url: 'https://example.com' }),
    ).rejects.toMatchObject({ reason: 'invalid_response' });
    host.close();
  });

  test('tools without a manifest schema entry skip validation', async () => {
    const host = createFakeHost({
      definition: defineAddon({ tools: { 'example.free': async () => ({ any: true }) } }),
      manifest,
    });
    const result = await host.callTool('example', 'example.free', { whatever: 1 });
    expect(result.output).toEqual({ any: true });
    host.close();
  });
});
