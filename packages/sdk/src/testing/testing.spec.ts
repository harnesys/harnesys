import { describe, expect, test } from 'bun:test';
import { defineAddon } from '../define-addon.ts';
import { AddonError } from '../protocol/error.ts';
import { createFakeDb, guardSql, SqlAuthorizerError } from './fake-db.ts';
import type { FakeHostOptions } from './fake-host.ts';
import { createFakeHost } from './fake-host.ts';
import { demoDefinition, validManifest } from './fixtures.ts';

function makeHost(overrides?: Partial<FakeHostOptions>) {
  return createFakeHost({
    definition: demoDefinition(),
    manifest: validManifest(),
    config: { channel: 'general' },
    secrets: { token: 'sekrit' },
    accounts: [
      { connection: 'example', accountId: 'acc-1', credentials: { token: 't1' } },
      { connection: 'example', accountId: 'acc-2', credentials: { token: 't2' } },
    ],
    http: (request) => ({ status: 200, body: `hello from ${new URL(request.url).host}` }),
    ...overrides,
  });
}

describe('fake host services', () => {
  test('callTool round-trips through db and log', async () => {
    const host = makeHost({
      definition: defineAddon({
        tools: {
          'example.store': async (_input, ctx) => {
            await ctx.db.exec('create table notes (id integer primary key, text text)');
            await ctx.db.run('insert into notes (text) values (?)', ['hello']);
            const rows = await ctx.db.all('select text from notes');
            const row = await ctx.db.get('select text from notes where id = ?', [1]);
            await ctx.log.warn('stored', { rows: rows.length });
            return { rows: rows.length, first: row?.text };
          },
        },
      }),
      manifest: validManifest(),
    });
    const result = await host.callTool('example', 'example.store');
    expect(result.output).toEqual({ rows: 1, first: 'hello' });
    expect(host.logs[0]?.level).toBe('warn');
    host.close();
  });

  test('db.batch is applied in one transaction and the authorizer denies forbidden sql', async () => {
    const host = makeHost();
    await host.deliver('tools.call', { pack: 'example', tool: 'example.ping', input: {} });
    const db = createFakeDb();
    db.exec('create table t (id integer primary key)');
    const results = db.batch([
      { sql: 'insert into t (id) values (1)' },
      { sql: 'insert into t (id) values (2)' },
    ]);
    expect(results.map((r) => r.changes)).toEqual([1, 1]);
    expect(db.all('select count(*) as c from t')[0]?.c).toBe(2);
    expect(() => guardSql("attach database 'x.db' as x")).toThrow(SqlAuthorizerError);
    expect(() => guardSql('detach x')).toThrow(SqlAuthorizerError);
    expect(() => guardSql("select load_extension('evil')")).toThrow(SqlAuthorizerError);
    expect(() => guardSql('pragma journal_mode = wal')).toThrow(SqlAuthorizerError);
    expect(() => guardSql('pragma user_version')).not.toThrow();
    db.close();
    host.close();
  });

  test('http fake responds; a host without an http handler is unavailable', async () => {
    const definition = defineAddon({
      tools: {
        'example.fetch': async (_input, ctx) =>
          (await ctx.http.fetch({ url: 'https://api.example.com/v1' })).body,
      },
    });
    const scoped = createFakeHost({
      definition,
      manifest: validManifest(),
      http: (request) => ({ status: 200, body: `hello from ${new URL(request.url).host}` }),
    });
    const output = await scoped.callTool('example', 'example.fetch');
    expect(output.output).toBe('hello from api.example.com');
    const noHandler = createFakeHost({ definition, manifest: validManifest() });
    await expect(noHandler.callTool('example', 'example.fetch')).rejects.toMatchObject({
      reason: 'unavailable',
    });
    scoped.close();
    noHandler.close();
  });

  test('http scope limits hosts outside the grant', async () => {
    const definition = defineAddon({
      tools: {
        'example.fetch': async (_input, ctx) =>
          (await ctx.http.fetch({ url: 'https://evil.example.com/v1' })).status,
      },
    });
    const host = createFakeHost({
      definition,
      manifest: validManifest(),
      http: () => ({ status: 200 }),
    });
    await expect(host.callTool('example', 'example.fetch')).rejects.toMatchObject({
      reason: 'permission_denied',
    });
    host.close();
  });

  test('accounts honor bindings, cardinality and credentials permission', async () => {
    const host = makeHost({
      grants: [{ id: 'accounts.use' }, { id: 'accounts.credentials' }],
      definition: defineAddon({
        tools: {
          'example.accounts': async (_input, ctx) => ({
            list: await ctx.accounts.list('example'),
            access: await ctx.accounts.access('example', 'acc-1'),
            report: await ctx.accounts.report('example', 'auth_expired', 'acc-1'),
          }),
        },
      }),
      manifest: validManifest(),
      accounts: [
        { connection: 'example', accountId: 'acc-1', credentials: { token: 't1' } },
        { connection: 'example', accountId: 'acc-2', credentials: { token: 't2' } },
      ],
    });
    const output = (await host.callTool('example', 'example.accounts')).output as {
      list: Array<{ accountId: string }>;
      access: { credentials: { token: string } };
    };
    expect(output.list.map((a) => a.accountId).sort()).toEqual(['acc-1', 'acc-2']);
    expect(output.access.credentials.token).toBe('t1');
    expect(host.accountReports[0]?.code).toBe('auth_expired');
    host.close();
  });

  test('accounts.access is denied without the accounts.credentials grant', async () => {
    const host = makeHost({ grants: [{ id: 'accounts.use' }] });
    await expect(
      host.service('accounts.access', { connection: 'example', accountId: 'acc-1' }),
    ).rejects.toMatchObject({ reason: 'permission_denied' });
    const list = await host.service('accounts.list', { connection: 'example' });
    expect(list).toBeDefined();
    host.close();
  });

  test('triggers fire with dedup on runKey', async () => {
    const host = makeHost({
      grants: [{ id: 'trigger' }],
      definition: defineAddon({
        triggers: {
          'telegram.feed': { start: async () => undefined, stop: async () => undefined },
        },
      }),
      manifest: validManifest(),
    });
    await expect(
      host.service('triggers.fire', { instanceId: 'i1', runKey: 'k1' }),
    ).rejects.toMatchObject({ reason: 'not_found' });
    await host.startTrigger('i1', 'telegram.feed', { chat: 'x' });
    const first = (await host.service('triggers.fire', { instanceId: 'i1', runKey: 'k1' })) as {
      outcome: string;
    };
    const second = (await host.service('triggers.fire', { instanceId: 'i1', runKey: 'k1' })) as {
      outcome: string;
    };
    const third = (await host.service('triggers.fire', { instanceId: 'i1', runKey: 'k2' })) as {
      outcome: string;
    };
    expect([first.outcome, second.outcome, third.outcome]).toEqual([
      'fired',
      'suppressed',
      'fired',
    ]);
    await host.stopTrigger('i1');
    await expect(
      host.service('triggers.fire', { instanceId: 'i1', runKey: 'k3' }),
    ).rejects.toBeInstanceOf(AddonError);
    host.close();
  });

  test('events.emit enforces the addon namespace and collects payloads', async () => {
    const host = makeHost({
      definition: defineAddon({
        tools: {
          'example.emit': (_input, ctx) => ctx.events.emit('harnesys.demo.ready', { ok: true }),
        },
      }),
      manifest: validManifest(),
    });
    await host.callTool('example', 'example.emit');
    await expect(
      host.service('events.emit', { name: 'other.addon.ready', payload: {} }),
    ).rejects.toMatchObject({ reason: 'invalid_params' });
    expect(host.emitted[0]?.name).toBe('harnesys.demo.ready');
    host.close();
  });

  test('config.get and secrets.get return the fakes', async () => {
    const host = makeHost({
      definition: defineAddon({
        tools: {
          'example.config': async (_input, ctx) => ({
            config: await ctx.config.get(['channel']),
            allConfig: await ctx.config.get(),
            secret: await ctx.secrets.get('token'),
          }),
        },
      }),
      manifest: validManifest(),
    });
    const output = (await host.callTool('example', 'example.config')).output as {
      config: Record<string, unknown>;
      secret: string | null;
    };
    expect(output.config).toEqual({ channel: 'general' });
    expect(output.secret).toBe('sekrit');
    host.close();
  });

  test('runs.dispatch and threads.create record and return ids', async () => {
    const host = makeHost({
      grants: [{ id: 'runs.dispatch' }, { id: 'threads.create' }],
      definition: defineAddon({
        tools: {
          'example.run': async (_input, ctx) => ({
            runId: (await ctx.runs.dispatch({ input: 'do it' })).runId,
            threadId: (
              await ctx.threads.create({ agentId: '00000000-0000-1000-8000-000000000001' })
            ).threadId,
          }),
        },
      }),
      manifest: validManifest(),
    });
    const output = (await host.callTool('example', 'example.run')).output as {
      runId: string;
      threadId: string;
    };
    expect(output.runId).toBe('run-1');
    expect(output.threadId).toBe('thread-1');
    expect(host.dispatchedRuns[0]?.input).toBe('do it');
    host.close();
  });

  test('runs.cancel records the cancelled run behind the runs.dispatch grant', async () => {
    const make = (grants: Array<{ id: string }>) =>
      createFakeHost({
        grants,
        definition: defineAddon({
          tools: {
            'example.cancel': async (_input, ctx) =>
              (await ctx.runs.cancel({ threadId: 't-1', runId: 'run-1' })).ok,
          },
        }),
        manifest: validManifest(),
      });
    const host = make([{ id: 'runs.dispatch' }]);
    const output = (await host.callTool('example', 'example.cancel')).output as boolean;
    expect(output).toBe(true);
    expect(host.cancelledRuns[0]).toEqual({ threadId: 't-1', runId: 'run-1' });
    host.close();
    const denied = make([]);
    await expect(denied.callTool('example', 'example.cancel')).rejects.toMatchObject({
      reason: 'permission_denied',
    });
    denied.close();
  });

  test('hook.deliver reaches addon handlers and notifications reach notification handlers', async () => {
    let seen: string | undefined;
    let changedKeys: string[] | undefined;
    const host = createFakeHost({
      definition: defineAddon({
        hooks: {
          onThread: async (params) => {
            seen = (params.event as { type?: string }).type;
          },
        },
        notifications: {
          'config.changed': async (params) => {
            changedKeys = params.keys;
          },
        },
      }),
      manifest: validManifest(),
    });
    await host.emit({ type: 'thread.created' }, 'onThread');
    expect(seen).toBe('thread.created');
    await host.notify('config.changed', { keys: ['channel'] });
    expect(changedKeys).toEqual(['channel']);
    host.close();
  });

  test('unknown addon-to-host methods are unsupported and workers.report is recorded', async () => {
    const host = makeHost({ grants: [{ id: 'worker' }] });
    await expect(host.service('db.vacuum', {})).rejects.toMatchObject({ reason: 'unsupported' });
    await host.service('workers.report', {
      workerId: 'poller',
      state: 'failed',
      code: 'quota_exceeded',
    });
    expect(host.workerReports[0]?.state).toBe('failed');
    host.close();
  });
});

describe('call meta and cancellation', () => {
  test('deliver stamps _meta and the handler observes it', async () => {
    let correlation: string | undefined;
    const host = createFakeHost({
      definition: defineAddon({
        tools: {
          'example.ping': async (_input, ctx) => {
            correlation = ctx.meta.correlationId;
            return {};
          },
        },
      }),
      manifest: validManifest(),
    });
    await host.callTool('example', 'example.ping');
    expect(correlation).toMatch(/^fake-/);
    host.close();
  });

  test('advancing time past the deadline produces a timeout', async () => {
    const host = createFakeHost({
      definition: demoDefinition(),
      manifest: validManifest(),
      now: () => 1_000,
    });
    host.advanceTime(10_000);
    await expect(
      host.deliver('tools.call', { pack: 'example', tool: 'example.ping', input: {} }),
    ).rejects.toMatchObject({ reason: 'timeout' });
    host.close();
  });

  test('jobs and routes dispatch to handlers', async () => {
    const host = makeHost();
    await host.runJob('sync');
    expect(host.logs[0]?.message).toBe('job ran');
    const route = await host.callRoute('items', { path: '/items/3' });
    expect(route.status).toBe(200);
    host.close();
  });
});
