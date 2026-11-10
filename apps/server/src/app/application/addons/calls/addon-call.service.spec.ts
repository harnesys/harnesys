import { describe, expect, test } from 'bun:test';
import { AddonException } from '../../../domain/addons/errors.ts';
import { FakeRpc, FakeSupervisor, NullLogger } from '../addons.fakes.ts';
import { AddonCallService } from './addon-call.service.ts';

function build() {
  const supervisor = new FakeSupervisor();
  const rpc = new FakeRpc();
  const service = new AddonCallService(supervisor, rpc, new NullLogger());
  return { service, supervisor, rpc };
}

describe('AddonCallService', () => {
  test('ensures running then dispatches protocol method with family default timeout', async () => {
    const { service, supervisor, rpc } = build();
    const result = await service.callTool('org1', 'acme.tool', {
      pack: 'acme',
      tool: 'ping',
      input: {},
    });
    expect(result.output).toEqual({ ok: true });
    expect(supervisor.started).toEqual(['org1/acme.tool:tools.call']);
    expect(rpc.requests[0]).toMatchObject({ method: 'tools.call', timeoutMs: 60_000 });
  });

  test('passes explicit timeout override', async () => {
    const { service, rpc } = build();
    await service.callTool(
      'org1',
      'acme.tool',
      { pack: 'acme', tool: 'ping', input: {} },
      { timeoutMs: 600_000 },
    );
    expect(rpc.requests[0]?.timeoutMs).toBe(600_000);
  });

  test('uses per-method defaults', async () => {
    const { service, rpc } = build();
    await service.callRoute('org1', 'acme.tool', {
      routeId: 'items',
      request: { method: 'GET', path: '/items', query: {}, headers: {} } as never,
    });
    await service.hookDeliver('org1', 'acme.tool', { hookId: 'h1', event: {} });
    expect(rpc.requests.map((entry) => entry.method)).toEqual(['route.handle', 'hook.deliver']);
    expect(rpc.requests[0]?.timeoutMs).toBe(30_000);
    expect(rpc.requests[1]?.timeoutMs).toBe(10_000);
  });

  test('throws unavailable when instance is not running', async () => {
    const { service, supervisor, rpc } = build();
    supervisor.states.set('org1/acme.tool', {
      orgId: 'org1',
      addonId: 'acme.tool',
      generation: 1,
      state: 'failed',
      lastError: 'crashed',
      restarts: 3,
    });
    await expect(
      service.callTool('org1', 'acme.tool', { pack: 'acme', tool: 'ping', input: {} }),
    ).rejects.toThrow(AddonException);
    expect(rpc.requests).toHaveLength(0);
  });

  test('detects generation staleness after the call', async () => {
    const { service, supervisor } = build();
    const pending = service.callTool('org1', 'acme.tool', {
      pack: 'acme',
      tool: 'ping',
      input: {},
    });
    supervisor.states.set('org1/acme.tool', {
      orgId: 'org1',
      addonId: 'acme.tool',
      generation: 2,
      state: 'running',
      restarts: 1,
    });
    await expect(pending).rejects.toThrow('restarted');
  });

  test('routes trigger lifecycle through protocol methods', async () => {
    const { service, rpc } = build();
    await service.triggerStart('org1', 'acme.tool', {
      instanceId: 'inst1',
      kind: 'feed',
      config: {},
    });
    await service.triggerStop('org1', 'acme.tool', { instanceId: 'inst1' });
    await service.jobRun('org1', 'acme.tool', { jobId: 'sync' });
    expect(rpc.requests.map((entry) => entry.method)).toEqual([
      'trigger.start',
      'trigger.stop',
      'job.run',
    ]);
  });
});
