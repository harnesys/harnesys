import { describe, expect, test } from 'bun:test';
import { UsageValidationError } from '../../../../domain/usage/usage.errors.ts';
import { callCtx } from '../spec-fakes.ts';
import { stubUsage } from '../spec-fakes-reads.ts';
import { UsageHostService } from './usage-service.ts';

describe('usage service', () => {
  test('delegates to UsagePort.summary scoped to the call org', async () => {
    const port = stubUsage({
      inputTokens: 100,
      outputTokens: 40,
      costUsd: 0.5,
      byModel: [{ model: 'm1', inputTokens: 100, outputTokens: 40, costUsd: 0.5 }],
    });
    const svc = new UsageHostService(port);
    const spec = svc.methods[0];
    expect(spec?.name).toBe('usage.summary');
    expect(spec?.permission).toBe('usage.read');
    await expect(
      spec?.handle(callCtx(), { threadId: 't1', since: '2026-01-01T00:00:00Z' }),
    ).resolves.toEqual({
      inputTokens: 100,
      outputTokens: 40,
      costUsd: 0.5,
      byModel: [{ model: 'm1', inputTokens: 100, outputTokens: 40, costUsd: 0.5 }],
    });
    expect(port.requests[0]).toEqual({
      orgId: 'org1',
      threadId: 't1',
      since: '2026-01-01T00:00:00Z',
    });
  });

  test('maps UsageValidationError to invalid_params', async () => {
    const port = stubUsage();
    port.summary = () => {
      throw new UsageValidationError('since is not a valid ISO date: nope');
    };
    const svc = new UsageHostService(port);
    await expect(svc.methods[0]?.handle(callCtx(), { since: 'nope' })).rejects.toMatchObject({
      reason: 'invalid_params',
    });
  });
});
