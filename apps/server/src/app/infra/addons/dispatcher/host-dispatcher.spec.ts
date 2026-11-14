import { describe, expect, test } from 'bun:test';
import { AddonError } from '@harnesys/sdk';
import { z } from 'zod';
import { buildDispatcher, buildSpecModule, methodSpec, target } from './spec-fakes.ts';

describe('HostDispatcher pipeline', () => {
  test('unknown method → unsupported', async () => {
    const { dispatcher } = buildDispatcher(buildSpecModule([]));
    await expect(dispatcher.dispatch(target(), 'test.nope', {})).rejects.toMatchObject({
      reason: 'unsupported',
    });
  });

  test('stale generation is dropped', async () => {
    const { dispatcher } = buildDispatcher(
      buildSpecModule([
        methodSpec({
          name: 'test.echo',
          handle: async () => ({ value: 1 }),
        }),
      ]),
      3,
    );
    await expect(dispatcher.dispatch(target(), 'test.echo', { value: 1 })).rejects.toMatchObject({
      reason: 'unavailable',
    });
  });

  test('missing permission → permission_denied', async () => {
    const { dispatcher } = buildDispatcher(
      buildSpecModule([
        methodSpec({
          name: 'test.echo',
          permission: 'accounts.credentials',
          handle: async () => ({ value: 1 }),
        }),
      ]),
    );
    await expect(dispatcher.dispatch(target(), 'test.echo', { value: 1 })).rejects.toMatchObject({
      reason: 'permission_denied',
    });
  });

  test('revoked grant applies on the next call (fresh read per call)', async () => {
    const { dispatcher, repo } = buildDispatcher(
      buildSpecModule([
        methodSpec({
          name: 'test.echo',
          permission: 'runs.dispatch',
          handle: async (_ctx, params) => ({ value: params.value }),
        }),
      ]),
    );
    await expect(dispatcher.dispatch(target(), 'test.echo', { value: 5 })).resolves.toEqual({
      value: 5,
    });
    repo.updateGrants('org1', 'acme.test', '[]');
    await expect(dispatcher.dispatch(target(), 'test.echo', { value: 5 })).rejects.toMatchObject({
      reason: 'permission_denied',
    });
  });

  test('invalid params → invalid_params', async () => {
    const { dispatcher } = buildDispatcher(
      buildSpecModule([
        methodSpec({
          name: 'test.echo',
          handle: async () => ({ value: 1 }),
        }),
      ]),
    );
    await expect(
      dispatcher.dispatch(target(), 'test.echo', { value: 'nope' }),
    ).rejects.toMatchObject({
      reason: 'invalid_params',
    });
  });

  test('rate limit burst: calls beyond burst → rate_limited', async () => {
    const { dispatcher } = buildDispatcher(
      buildSpecModule([
        methodSpec({
          name: 'test.echo',
          limits: { rate: { perSec: 1, burst: 2 } },
          handle: async () => ({ value: 1 }),
        }),
      ]),
    );
    await expect(dispatcher.dispatch(target(), 'test.echo', { value: 1 })).resolves.toEqual({
      value: 1,
    });
    await expect(dispatcher.dispatch(target(), 'test.echo', { value: 1 })).resolves.toEqual({
      value: 1,
    });
    await expect(dispatcher.dispatch(target(), 'test.echo', { value: 1 })).rejects.toMatchObject({
      reason: 'rate_limited',
    });
  });

  test('handler timeout → timeout', async () => {
    const { dispatcher } = buildDispatcher(
      buildSpecModule([
        methodSpec({
          name: 'test.echo',
          limits: { timeoutMs: 30 },
          handle: () => new Promise(() => {}),
        }),
      ]),
    );
    await expect(dispatcher.dispatch(target(), 'test.echo', { value: 1 })).rejects.toMatchObject({
      reason: 'timeout',
    });
  });

  test('result schema violation → invalid_response', async () => {
    const { dispatcher } = buildDispatcher(
      buildSpecModule([
        methodSpec({
          name: 'test.echo',
          handle: async () => ({ wrong: true }),
        }),
      ]),
    );
    await expect(dispatcher.dispatch(target(), 'test.echo', { value: 1 })).rejects.toMatchObject({
      reason: 'invalid_response',
    });
  });

  test('result over 256 KiB default cap → invalid_response', async () => {
    const { dispatcher } = buildDispatcher(
      buildSpecModule([
        methodSpec({
          name: 'test.echo',
          result: z.object({ blob: z.string() }),
          handle: async () => ({ blob: 'x'.repeat(300 * 1024) }),
        }),
      ]),
    );
    await expect(dispatcher.dispatch(target(), 'test.echo', { value: 1 })).rejects.toMatchObject({
      reason: 'invalid_response',
    });
  });

  test('method limit raises the result cap', async () => {
    const { dispatcher } = buildDispatcher(
      buildSpecModule([
        methodSpec({
          name: 'test.echo',
          result: z.object({ blob: z.string() }),
          limits: { maxResultKb: 8192 },
          handle: async () => ({ blob: 'x'.repeat(300 * 1024) }),
        }),
      ]),
    );
    await expect(dispatcher.dispatch(target(), 'test.echo', { value: 1 })).resolves.toMatchObject({
      blob: expect.any(String),
    });
  });

  test('handler crash is wrapped to internal', async () => {
    const { dispatcher } = buildDispatcher(
      buildSpecModule([
        methodSpec({
          name: 'test.echo',
          handle: async () => {
            throw new Error('kaboom');
          },
        }),
      ]),
    );
    await expect(dispatcher.dispatch(target(), 'test.echo', { value: 1 })).rejects.toMatchObject({
      reason: 'internal',
    });
  });

  test('ok call records metrics and does not audit', async () => {
    const { dispatcher, metrics, audit } = buildDispatcher(
      buildSpecModule([
        methodSpec({
          name: 'test.echo',
          handle: async (_ctx, params) => ({ value: params.value }),
        }),
      ]),
    );
    await expect(dispatcher.dispatch(target(), 'test.echo', { value: 7 })).resolves.toEqual({
      value: 7,
    });
    expect(metrics.counters).toHaveLength(1);
    expect(metrics.counters[0]?.labels).toEqual({
      addon: 'acme.test',
      method: 'test.echo',
      outcome: 'ok',
    });
    expect(audit.rows).toHaveLength(0);
  });

  test('denied call is audited', async () => {
    const { dispatcher, audit } = buildDispatcher(
      buildSpecModule([
        methodSpec({
          name: 'test.echo',
          permission: 'accounts.credentials',
          handle: async () => ({ value: 1 }),
        }),
      ]),
    );
    await expect(dispatcher.dispatch(target(), 'test.echo', { value: 1 })).rejects.toMatchObject({
      reason: 'permission_denied',
    });
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.result).toBe('permission_denied');
  });

  test('disabled add-on → unavailable', async () => {
    const { dispatcher, repo } = buildDispatcher(
      buildSpecModule([
        methodSpec({
          name: 'test.echo',
          handle: async () => ({ value: 1 }),
        }),
      ]),
    );
    repo.setEnabled('org1', 'acme.test', false);
    await expect(dispatcher.dispatch(target(), 'test.echo', { value: 1 })).rejects.toMatchObject({
      reason: 'unavailable',
    });
  });

  test('AddonError from handler keeps its reason', async () => {
    const { dispatcher } = buildDispatcher(
      buildSpecModule([
        methodSpec({
          name: 'test.echo',
          handle: async () => {
            throw new AddonError('not_found', { detail: 'missing' });
          },
        }),
      ]),
    );
    await expect(dispatcher.dispatch(target(), 'test.echo', { value: 1 })).rejects.toMatchObject({
      reason: 'not_found',
    });
  });
});
