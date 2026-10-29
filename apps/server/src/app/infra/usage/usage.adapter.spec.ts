import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MembershipRepository } from '../../domain/identity/membership-repository.port.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import { createTestLayout } from '../issues/board-repository.test-layout.ts';
import { UsageAdapter } from './usage.adapter.ts';

class FakeUsers extends UserRepository {
  insert(): void {}
  findByLogin(): null {
    return null;
  }
  findById(): null {
    return null;
  }
  updatePasswordHash(): void {}
  count(): number {
    return 0;
  }
  upsertSync(): void {}
}

class FakeMemberships extends MembershipRepository {
  upsert(): void {}
  upsertSync(): void {}
  findByUserAndOrg(): null {
    return null;
  }
  listByUser(): [] {
    return [];
  }
  listByOrg(): [] {
    return [];
  }
  remove(): void {}
}

describe('UsageAdapter price overrides', () => {
  const home = mkdtempSync(join(tmpdir(), 'harnesys-usage-'));
  const layout = createTestLayout(home);
  const adapter = new UsageAdapter(layout, new FakeUsers(), new FakeMemberships());
  const orgId = 'org-1';

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test('writes a fractional per-1M price and reads it back', () => {
    adapter.setPriceOverride(orgId, 'model-1', { inputPer1M: 2.5, outputPer1M: 10 });
    const stored = adapter.getPriceOverride(orgId, 'model-1');
    expect(stored?.inputPer1M).toBe(2.5);
    expect(stored?.outputPer1M).toBe(10);
  });

  test('rewrites an existing override instead of duplicating it', () => {
    adapter.setPriceOverride(orgId, 'model-1', { inputPer1M: 3, outputPer1M: 15 });
    const stored = adapter.getPriceOverride(orgId, 'model-1');
    expect(stored?.inputPer1M).toBe(3);
    expect(stored?.outputPer1M).toBe(15);
    expect(adapter.listPriceOverrides(orgId)).toHaveLength(1);
  });

  test('override is removable', () => {
    adapter.setPriceOverride(orgId, 'model-2', { inputPer1M: 1, outputPer1M: 2 });
    expect(adapter.deletePriceOverride(orgId, 'model-2')).toBe(true);
    expect(adapter.getPriceOverride(orgId, 'model-2')).toBeNull();
  });

  test('unknown model has no override', () => {
    expect(adapter.getPriceOverride(orgId, 'unknown-model')).toBeNull();
  });
});

describe('UsageAdapter agent day range', () => {
  const home = mkdtempSync(join(tmpdir(), 'harnesys-usage-range-'));
  const layout = createTestLayout(home);
  const adapter = new UsageAdapter(layout, new FakeUsers(), new FakeMemberships());
  const orgId = 'org-1';

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test('sums only the rows inside the half-open range', () => {
    adapter.record(orgId, {
      id: 'u-in',
      ts: '2026-10-21T10:00:00.000Z',
      agentId: 'agent-1',
      runId: 'run-1',
      model: 'model-1',
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.5,
      pricingSource: 'catalog',
    });
    adapter.record(orgId, {
      id: 'u-edge',
      ts: '2026-10-22T00:00:00.000Z',
      agentId: 'agent-1',
      runId: 'run-1',
      model: 'model-1',
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0.25,
      pricingSource: 'catalog',
    });
    adapter.record(orgId, {
      id: 'u-out',
      ts: '2026-10-22T10:00:00.000Z',
      agentId: 'agent-1',
      runId: 'run-2',
      model: 'model-1',
      inputTokens: 7,
      outputTokens: 3,
      costUsd: 2,
      pricingSource: 'provider',
    });
    const spent = adapter.sumAgentDayCostUsd(
      orgId,
      'agent-1',
      '2026-10-21T00:00:00.000Z',
      '2026-10-22T00:00:00.000Z',
    );
    expect(spent).toBe(0.5);
  });

  test('ignores spend of other agents', () => {
    adapter.record(orgId, {
      id: 'u-other-agent',
      ts: '2026-10-21T11:00:00.000Z',
      agentId: 'agent-2',
      runId: 'run-3',
      model: 'model-1',
      inputTokens: 4,
      outputTokens: 4,
      costUsd: 4,
      pricingSource: 'catalog',
    });
    const spent = adapter.sumAgentDayCostUsd(
      orgId,
      'agent-1',
      '2026-10-21T00:00:00.000Z',
      '2026-10-22T00:00:00.000Z',
    );
    expect(spent).toBe(0.5);
  });
});

describe('UsageAdapter report grouping', () => {
  const home = mkdtempSync(join(tmpdir(), 'harnesys-usage-group-'));
  const layout = createTestLayout(home);
  const adapter = new UsageAdapter(layout, new FakeUsers(), new FakeMemberships());
  const orgId = 'org-1';

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test('groups days by the org timezone', () => {
    adapter.record(orgId, {
      id: 'g1',
      ts: '2026-10-21T23:00:00.000Z',
      agentId: 'agent-1',
      runId: 'run-1',
      model: 'model-1',
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 1,
      pricingSource: 'catalog',
    });
    const utc = adapter.report(orgId, {
      orgId,
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-31T23:59:59.999Z',
      timezone: 'UTC',
    });
    expect(utc.rows.map((row) => row.key)).toEqual(['2026-10-21']);
    const moscow = adapter.report(orgId, {
      orgId,
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-31T23:59:59.999Z',
      timezone: 'Europe/Moscow',
    });
    expect(moscow.rows.map((row) => row.key)).toEqual(['2026-10-22']);
  });
});

describe('UsageAdapter runs report', () => {
  const home = mkdtempSync(join(tmpdir(), 'harnesys-usage-runs-'));
  const layout = createTestLayout(home);
  const adapter = new UsageAdapter(layout, new FakeUsers(), new FakeMemberships());
  const orgId = 'org-1';

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test('aggregates by run and model and sorts by cost', () => {
    adapter.record(orgId, {
      id: 'r1-m1',
      ts: '2026-10-20T10:00:00.000Z',
      agentId: 'agent-1',
      runId: 'run-1',
      model: 'model-1',
      modelId: 'model-1',
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 5,
      cacheWriteTokens: 3,
      costUsd: 1,
      pricingSource: 'catalog',
    });
    adapter.record(orgId, {
      id: 'r1-m1-b',
      ts: '2026-10-20T11:00:00.000Z',
      agentId: 'agent-1',
      runId: 'run-1',
      model: 'model-1',
      modelId: 'model-1',
      inputTokens: 50,
      outputTokens: 10,
      costUsd: 0.5,
      pricingSource: 'catalog',
    });
    adapter.record(orgId, {
      id: 'r1-m2',
      ts: '2026-10-20T12:00:00.000Z',
      agentId: 'agent-1',
      runId: 'run-1',
      model: 'model-2',
      modelId: 'model-2',
      inputTokens: 7,
      outputTokens: 3,
      costUsd: 3,
      pricingSource: 'manual',
    });
    adapter.record(orgId, {
      id: 'r2-m1',
      ts: '2026-10-21T09:00:00.000Z',
      agentId: 'agent-2',
      runId: 'run-2',
      model: 'model-1',
      modelId: 'model-1',
      inputTokens: 10,
      outputTokens: 2,
      costUsd: 0.25,
      pricingSource: 'none',
    });
    const report = adapter.runsReport(orgId, {
      orgId,
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-31T23:59:59.999Z',
    });
    expect(report.rows).toHaveLength(3);
    expect(report.rows[0]).toMatchObject({
      runId: 'run-1',
      model: 'model-2',
      modelId: 'model-2',
      inputTokens: 7,
      outputTokens: 3,
      costUsd: 3,
      pricingSource: 'manual',
      ts: '2026-10-20T12:00:00.000Z',
    });
    expect(report.rows[1]).toMatchObject({
      runId: 'run-1',
      model: 'model-1',
      inputTokens: 150,
      outputTokens: 30,
      cacheReadTokens: 5,
      cacheWriteTokens: 3,
      costUsd: 1.5,
      pricingSource: 'catalog',
      ts: '2026-10-20T11:00:00.000Z',
    });
    expect(report.totals).toEqual({
      inputTokens: 167,
      outputTokens: 35,
      costUsd: 4.75,
      runs: 2,
    });
  });

  test('clamps the limit and keeps totals over the whole range', () => {
    const report = adapter.runsReport(orgId, {
      orgId,
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-31T23:59:59.999Z',
      limit: 1000,
    });
    expect(report.rows.length).toBeLessThanOrEqual(200);
    const limited = adapter.runsReport(orgId, {
      orgId,
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-31T23:59:59.999Z',
      limit: 1,
    });
    expect(limited.rows).toHaveLength(1);
    expect(limited.totals.costUsd).toBe(report.totals.costUsd);
  });
});
