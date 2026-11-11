import { describe, expect, test } from 'bun:test';
import { KNOWN_PERMISSION_IDS } from '../permissions/permissions.ts';
import { decodeMessage, encodeMessage, errorResponse } from './envelope.ts';
import { InitializeParamsSchema, InitializeResultSchema } from './handshake.ts';
import type { HostRequestParams, HostServiceParams, HostServiceResult } from './map.ts';
import { methodSpec, PROTOCOL_METHODS, protocolEntries, protocolMap } from './map.ts';
import { CallMetaSchema } from './meta.ts';

describe('protocol method map conformance', () => {
  test('every entry has params, a known direction and consistent result presence', () => {
    for (const entry of protocolEntries()) {
      const spec = entry.spec;
      expect(spec.params).toBeDefined();
      expect(['host-to-addon', 'addon-to-host', 'notification']).toContain(spec.direction);
      if (spec.direction === 'notification') {
        expect(spec.result).toBeNull();
        expect(['host', 'addon', 'both'] as Array<string | undefined>).toContain(spec.sender);
      } else {
        expect(spec.result).not.toBeNull();
      }
      if (spec.permission !== null) {
        expect((KNOWN_PERMISSION_IDS as readonly string[]).includes(spec.permission)).toBe(true);
      }
    }
  });

  test('covers every method of the plan', () => {
    const expected = [
      'initialize',
      'initialized',
      'shutdown',
      'ping',
      'config.changed',
      'permissions.changed',
      'accounts.changed',
      'lifecycle.upgrade',
      'tools.call',
      'route.handle',
      'trigger.start',
      'trigger.stop',
      'job.run',
      'worker.start',
      'worker.stop',
      'transport.send',
      'transport.edit',
      'transport.typing',
      'hook.deliver',
      'source.list',
      'source.stat',
      'source.download',
      'source.upload',
      'source.mkdir',
      'source.remove',
      'source.export',
      'config.get',
      'secrets.get',
      'db.exec',
      'db.all',
      'db.get',
      'db.run',
      'db.batch',
      'log.write',
      'events.emit',
      'http.fetch',
      'files.stat',
      'files.read',
      'files.write',
      'accounts.list',
      'accounts.report',
      'accounts.access',
      'runs.dispatch',
      'runs.cancel',
      'threads.create',
      'triggers.fire',
      'bridge.inbound',
      'workers.report',
      '$/cancel',
      '$/progress',
    ];
    expect(PROTOCOL_METHODS.sort()).toEqual([...expected].sort());
  });

  test('service permissions follow the plan', () => {
    expect(protocolMap['http.fetch'].permission).toBe('http.fetch');
    expect(protocolMap['accounts.list'].permission).toBe('accounts.use');
    expect(protocolMap['accounts.access'].permission).toBe('accounts.credentials');
    expect(protocolMap['runs.dispatch'].permission).toBe('runs.dispatch');
    expect(protocolMap['runs.cancel'].permission).toBe('runs.dispatch');
    expect(protocolMap['threads.create'].permission).toBe('threads.create');
    expect(protocolMap['bridge.inbound'].permission).toBe('bridge.inbound');
    expect(protocolMap['triggers.fire'].permission).toBe('trigger');
    expect(protocolMap['workers.report'].permission).toBe('worker');
    expect(protocolMap['source.list'].permission).toBe('source');
    expect(protocolMap['source.upload'].permission).toBe('source');
    expect(protocolMap['files.read'].permission).toBe('files.read');
    expect(protocolMap['files.write'].permission).toBe('files.write');
    expect(protocolMap['db.run'].permission).toBeNull();
    expect(protocolMap['log.write'].permission).toBeNull();
  });

  test('host-to-addon request params require _meta (§6.3)', () => {
    const result = methodSpec('tools.call')?.params.safeParse({ pack: 'p', tool: 't' });
    expect(result?.success).toBe(false);
    const withMeta = methodSpec('tools.call')?.params.safeParse({
      pack: 'p',
      tool: 't',
      _meta: { correlationId: 'x', deadline: 1, principal: { type: 'system' }, locale: 'en' },
    });
    expect(withMeta?.success).toBe(true);
    expect(
      CallMetaSchema.safeParse({
        correlationId: 'x',
        deadline: 1,
        principal: { type: 'system' },
        locale: 'en',
      }).success,
    ).toBe(true);
  });
});

describe('envelope and golden fixtures', () => {
  test('initialize fixture decodes and validates against the handshake schemas', async () => {
    const raw = await import('./__fixtures__/initialize.request.json');
    const message = decodeMessage(JSON.stringify(raw.default));
    expect('method' in message && message.method).toBe('initialize');
    const params = InitializeParamsSchema.parse((message as { params: unknown }).params);
    expect(params.platform).toBe(1);
    expect(params.permissions[0]?.id).toBe('http.fetch');
  });

  test('tools.call fixture carries _meta and round-trips through encode/decode', async () => {
    const raw = await import('./__fixtures__/tools-call.request.json');
    const line = encodeMessage(raw.default as never);
    const message = decodeMessage(line);
    const params: HostRequestParams<'tools.call'> = protocolMap['tools.call'].params.parse(
      (message as { params: unknown }).params,
    );
    expect(params.pack).toBe('github');
    expect(params._meta.correlationId).toBe('run-42');
    expect(params._meta.principal.type).toBe('agent');
  });

  test('triggers.fire fixture validates and produces a typed outcome', async () => {
    const raw = await import('./__fixtures__/triggers-fire.request.json');
    const message = decodeMessage(JSON.stringify(raw.default));
    const params: HostServiceParams<'triggers.fire'> = protocolMap['triggers.fire'].params.parse(
      (message as { params: unknown }).params,
    );
    expect(params.runKey).toBe('message-9001');
    const result: HostServiceResult<'triggers.fire'> = protocolMap['triggers.fire'].result.parse({
      outcome: 'fired',
    });
    expect(result.outcome).toBe('fired');
  });

  test('threads.create fixture validates and accepts agentId', async () => {
    const raw = await import('./__fixtures__/threads-create.request.json');
    const message = decodeMessage(JSON.stringify(raw.default));
    const params: HostServiceParams<'threads.create'> = protocolMap['threads.create'].params.parse(
      (message as { params: unknown }).params,
    );
    expect(params.agentId).toBe('00000000-0000-1000-8000-000000000001');
  });

  test('initialize result validates', () => {
    const result = InitializeResultSchema.parse({
      addon: { id: 'harnesys.demo', version: '1.0.0' },
      handlers: ['ping', 'shutdown', 'tools.call'],
    });
    expect(result.handlers).toContain('tools.call');
  });

  test('error responses carry the addon error payload', () => {
    const encoded = encodeMessage(
      errorResponse(3, {
        code: -32000,
        message: 'permission_denied',
        data: { reason: 'permission_denied', retryable: false },
      }),
    );
    const decoded = decodeMessage(encoded);
    expect('error' in decoded && decoded.error?.data?.reason).toBe('permission_denied');
  });

  test('rejects messages over the size cap and invalid json-rpc', () => {
    expect(() => decodeMessage('{"jsonrpc":"1.0"}')).toThrow();
    const huge = `{"jsonrpc":"2.0","id":1,"result":"${'x'.repeat(9 * 1024 * 1024)}"}`;
    expect(() => decodeMessage(huge)).toThrow();
  });
});
