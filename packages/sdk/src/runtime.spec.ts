import { describe, expect, test } from 'bun:test';
import { defineAddon } from './define-addon.ts';
import type { HostChannel } from './host-client.ts';
import { AddonError } from './protocol/error.ts';
import { createAddonRuntime } from './runtime.ts';
import { demoDefinition } from './testing/fixtures.ts';

function meta(overrides?: Partial<{ deadline: number }>) {
  return {
    correlationId: 'c1',
    deadline: overrides?.deadline ?? 6_000,
    principal: { type: 'system' as const },
    locale: 'en',
  };
}

function silentChannel(): HostChannel {
  return {
    request: async () => ({}),
    notify: () => undefined,
  };
}

function runtimeWithNow(now: () => number) {
  return createAddonRuntime({
    definition: demoDefinition(),
    addon: { id: 'harnesys.demo', version: '1.0.0' },
    channel: silentChannel(),
    now,
  });
}

describe('addon runtime', () => {
  test('initialize returns the addon identity and derived handlers', () => {
    const runtime = runtimeWithNow(() => 1_000);
    const result = runtime.initialize({
      platform: 1,
      host: { version: '1.0.0', features: [] },
      instance: { orgId: 'o', generation: 1, dataDir: '/d', locale: 'en' },
      permissions: [],
      experimental: [],
      deprecations: [],
    });
    expect(result.addon).toEqual({ id: 'harnesys.demo', version: '1.0.0' });
    expect(result.handlers).toContain('tools.call');
  });

  test('dispatches tools.call to the named handler with context', async () => {
    const runtime = runtimeWithNow(() => 1_000);
    const output = (await runtime.handleRequest(
      'tools.call',
      { pack: 'example', tool: 'example.ping', input: { a: 1 }, _meta: meta() },
      new AbortController().signal,
    )) as { output: { pong: boolean; echo: { a: number }; org: string } };
    expect(output.output.pong).toBe(true);
    expect(output.output.echo.a).toBe(1);
  });

  test('rejects methods that are not declared in handlers', async () => {
    const runtime = createAddonRuntime({
      definition: { handlers: ['ping', 'shutdown'] },
      addon: { id: 'harnesys.demo', version: '1.0.0' },
      channel: silentChannel(),
    });
    await expect(
      runtime.handleRequest(
        'tools.call',
        { pack: 'x', tool: 'y', input: {}, _meta: meta() },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ reason: 'unsupported' });
  });

  test('rejects unknown handler keys with unsupported', async () => {
    const runtime = runtimeWithNow(() => 1_000);
    await expect(
      runtime.handleRequest(
        'tools.call',
        { pack: 'example', tool: 'missing.tool', input: {}, _meta: meta() },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ reason: 'unsupported' });
  });

  test('times out when the deadline has passed and cancels on abort', async () => {
    const runtime = runtimeWithNow(() => 10_000);
    await expect(
      runtime.handleRequest(
        'tools.call',
        { pack: 'example', tool: 'example.ping', input: {}, _meta: meta() },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ reason: 'timeout' });

    const slow = createAddonRuntime({
      definition: defineAddon({
        tools: { 'example.slow': () => new Promise((resolve) => setTimeout(resolve, 50)) },
      }),
      addon: { id: 'harnesys.demo', version: '1.0.0' },
      channel: silentChannel(),
      now: () => 1_000,
    });
    const controller = new AbortController();
    const pending = slow.handleRequest(
      'tools.call',
      { pack: 'example', tool: 'example.slow', input: {}, _meta: meta({ deadline: 6_000 }) },
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ reason: 'cancelled' });
  });

  test('notifications reject addon-sender methods and pass host notifications', async () => {
    const runtime = runtimeWithNow(() => 1_000);
    await expect(
      runtime.handleNotification(
        '$/progress',
        { token: 't', value: 1 },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ reason: 'unsupported' });
    await expect(
      runtime.handleNotification('initialized', {}, new AbortController().signal),
    ).resolves.toBeUndefined();
  });

  test('AddonError carries the payload data', () => {
    const error = new AddonError('account_failed', {
      retryable: true,
      detail: 'gone',
      accountCode: 'not_bound',
    });
    expect(error.toData()).toEqual({
      reason: 'account_failed',
      retryable: true,
      detail: 'gone',
      accountCode: 'not_bound',
    });
  });
});
