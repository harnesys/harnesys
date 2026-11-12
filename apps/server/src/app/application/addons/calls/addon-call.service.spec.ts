import { describe, expect, test } from 'bun:test';
import { AddonException } from '../../../domain/addons/errors.ts';
import type {
  AttachmentSourceInput,
  AttachmentSourceResult,
} from '../../../domain/addons/ports/attachment-source.port.ts';
import { AddonAttachmentSourcePort } from '../../../domain/addons/ports/attachment-source.port.ts';
import { FakeRpc, FakeSupervisor } from '../addons.fakes.ts';
import { AddonCallService } from './addon-call.service.ts';

class StubAttachmentSource extends AddonAttachmentSourcePort {
  override read(input: AttachmentSourceInput): Promise<AttachmentSourceResult> {
    return Promise.resolve({
      name: input.path,
      mediaType: 'text/plain',
      bytes: new TextEncoder().encode('stub'),
    });
  }
}

function build() {
  const supervisor = new FakeSupervisor();
  const rpc = new FakeRpc();
  const service = new AddonCallService(supervisor, rpc, new StubAttachmentSource());
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

  test('wraps transport.send params in the protocol envelope and unwraps messageId', async () => {
    const { service, rpc } = build();
    rpc.result = { messageId: 'tg-42' };
    const sent = await service.transportSend('org1', 'acme.chat', {
      channel: '315051038',
      text: 'hello',
    });
    expect(rpc.requests[0]?.method).toBe('transport.send');
    expect(rpc.requests[0]?.params).toEqual({ message: { channel: '315051038', text: 'hello' } });
    expect(sent).toEqual({ messageId: 'tg-42' });
  });

  test('keeps transport.edit envelope flat over the message field', async () => {
    const { service, rpc } = build();
    await service.transportEdit('org1', 'acme.chat', {
      messageId: 'tg-42',
      message: { channel: '315051038', text: 'edited' },
    });
    expect(rpc.requests[0]?.params).toEqual({
      messageId: 'tg-42',
      message: { channel: '315051038', text: 'edited' },
    });
  });
});
