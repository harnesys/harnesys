import { describe, expect, test } from 'bun:test';
import type { OrgAddonRow } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import type { WorkerLeaseState } from '../../../domain/addons/ports/worker-lease.port.ts';
import { AddonWorkerLeasePort } from '../../../domain/addons/ports/worker-lease.port.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';
import { BridgeHostService } from './bridge/bridge-service.ts';
import { ConfigHostService } from './config/config-service.ts';
import { DbHostService } from './db/db-service.ts';
import { EventsHostService } from './events/events-service.ts';
import { LogHostService } from './log/log-service.ts';
import { SecretsHostService } from './secrets/secrets-service.ts';
import {
  ADDON,
  callCtx,
  FakeBridgeSink,
  FakeBus,
  FakeDb,
  FakeLogSink,
  FakeSecrets,
  FakeTriggerRepo,
  FakeTriggerSink,
  FakeWorkerSink,
} from './spec-fakes.ts';
import { TriggersHostService } from './triggers/triggers-service.ts';
import { WorkersHostService } from './workers/workers-service.ts';

describe('events service', () => {
  test('publishes in the add-on namespace', async () => {
    const bus = new FakeBus();
    const svc = new EventsHostService(bus);
    await svc.methods[0]?.handle(callCtx(), { name: `${ADDON}.deployed`, payload: { ok: true } });
    expect(bus.published).toEqual([
      { orgId: 'org1', name: `${ADDON}.deployed`, payload: { ok: true } },
    ]);
  });

  test('rejects a foreign namespace', async () => {
    const svc = new EventsHostService(new FakeBus());
    await expect(
      svc.methods[0]?.handle(callCtx(), { name: 'other.addon.event', payload: {} }),
    ).rejects.toMatchObject({ reason: 'invalid_params' });
  });

  test('rejects a payload over 64 KiB', async () => {
    const svc = new EventsHostService(new FakeBus());
    await expect(
      svc.methods[0]?.handle(callCtx(), {
        name: `${ADDON}.x`,
        payload: { blob: 'x'.repeat(70 * 1024) },
      }),
    ).rejects.toMatchObject({ reason: 'invalid_params' });
  });
});

describe('db service', () => {
  test('passes statements through to AddonDbAccess', async () => {
    const db = new FakeDb();
    const svc = new DbHostService(db);
    await svc.methods[1]?.handle(callCtx(), { sql: 'select * from t' });
    await svc.methods[4]?.handle(callCtx(), {
      statements: [{ sql: 'insert into t values (?)', params: [1] }],
    });
    expect(db.calls).toEqual(['all', 'batch:1']);
  });

  test('db.run returns changes and lastInsertRowid', async () => {
    const svc = new DbHostService(new FakeDb());
    await expect(svc.methods[3]?.handle(callCtx(), { sql: 'update t set a=1' })).resolves.toEqual({
      changes: 1,
      lastInsertRowid: 3,
    });
  });
});

class StaticClock extends ClockPort {
  override now(): number {
    return 0;
  }
}

describe('log service', () => {
  test('appends to the sink with org/addon attribution', async () => {
    const sink = new FakeLogSink();
    const svc = new LogHostService(sink, new StaticClock());
    await svc.methods[0]?.handle(callCtx(), { level: 'info', message: 'hello' });
    expect(sink.entries[0]).toMatchObject({
      orgId: 'org1',
      addonId: ADDON,
      level: 'info',
      message: 'hello',
    });
  });

  test('enforces 1000 lines per minute → quota_exceeded', async () => {
    const svc = new LogHostService(new FakeLogSink(), new StaticClock());
    const handle = svc.methods[0]?.handle.bind(null, callCtx());
    for (let i = 0; i < 1000; i += 1) {
      await handle?.({ level: 'debug', message: `m${i}` });
    }
    await expect(handle?.({ level: 'debug', message: 'over' })).rejects.toMatchObject({
      reason: 'quota_exceeded',
    });
  });
});

describe('secrets service', () => {
  test('reads only through the scoped AddonSecrets', async () => {
    const svc = new SecretsHostService(new FakeSecrets({ 'org1:acme.test:apiKey': 's3cret' }));
    await expect(svc.methods[0]?.handle(callCtx(), { key: 'apiKey' })).resolves.toEqual({
      value: 's3cret',
    });
    await expect(svc.methods[0]?.handle(callCtx(), { key: 'missing' })).resolves.toEqual({
      value: null,
    });
  });
});

class FakeConfigRepo extends OrgAddonRepositoryPort {
  private readonly row: OrgAddonRow;

  constructor(configJson: string) {
    super();
    this.row = {
      orgId: 'org1',
      addonId: ADDON,
      version: '1.0.0',
      enabled: true,
      grantsJson: '[]',
      grantsDigest: '',
      configJson,
      health: 'running',
      lastError: null,
      createdAt: '',
      updatedAt: '',
    };
  }
  override find(): OrgAddonRow | null {
    return this.row;
  }
  override list(): OrgAddonRow[] {
    return [this.row];
  }
  override listAll(): OrgAddonRow[] {
    return [this.row];
  }
  override upsert(): void {}
  override setEnabled(): void {}
  override updateGrants(): void {}
  override updateConfig(): void {}
  override updateHealth(): void {}
  override remove(): void {}
}

describe('config service', () => {
  test('returns the stored config values', async () => {
    const svc = new ConfigHostService(new FakeConfigRepo('{"a":1,"b":"x"}'));
    const byKey = (await svc.methods[0]?.handle(callCtx(), { keys: ['a'] })) as {
      values: Record<string, unknown>;
    };
    const all = (await svc.methods[0]?.handle(callCtx(), {})) as {
      values: Record<string, unknown>;
    };
    expect(byKey).toEqual({ values: { a: 1 } });
    expect(all).toEqual({ values: { a: 1, b: 'x' } });
  });
});

describe('triggers service', () => {
  test('rejects an instance owned by another add-on', async () => {
    const repo = new FakeTriggerRepo();
    repo.row = { ...repo.row, addonId: 'other.addon' };
    const svc = new TriggersHostService(repo, new FakeTriggerSink());
    await expect(
      svc.methods[0]?.handle(callCtx(), { instanceId: 'ti1', runKey: 'k1' }),
    ).rejects.toMatchObject({ reason: 'not_found' });
  });

  test('fires owned instances through the sink', async () => {
    const sink = new FakeTriggerSink();
    const svc = new TriggersHostService(new FakeTriggerRepo(), sink);
    await expect(
      svc.methods[0]?.handle(callCtx(), { instanceId: 'ti1', runKey: 'k1', text: 'hi' }),
    ).resolves.toEqual({ outcome: 'fired' });
    expect(sink.fired).toEqual([{ instanceId: 'ti1', runKey: 'k1', correlationId: 'corr-1' }]);
  });
});

class StubWorkerLease extends AddonWorkerLeasePort {
  override claim(): WorkerLeaseState {
    return { held: true, epoch: 1, expiresAt: null };
  }

  override release(): boolean {
    return true;
  }
}

describe('bridge and workers services', () => {
  test('bridge.inbound delegates with correlation', async () => {
    const sink = new FakeBridgeSink();
    const svc = new BridgeHostService(sink);
    await svc.methods[0]?.handle(callCtx(), { message: { channel: 'c1', text: 'hello' } });
    expect(sink.messages).toEqual([{ channel: 'c1', correlationId: 'corr-1' }]);
  });

  test('workers.report delegates state', async () => {
    const sink = new FakeWorkerSink();
    const svc = new WorkersHostService(sink, new StubWorkerLease());
    await svc.methods[0]?.handle(callCtx(), { workerId: 'w1', state: 'failed', code: 'boom' });
    expect(sink.reports).toEqual([{ workerId: 'w1', state: 'failed', code: 'boom' }]);
  });
});
