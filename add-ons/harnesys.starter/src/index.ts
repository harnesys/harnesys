import type {
  HookHandler,
  JobHandler,
  RouteHandler,
  ToolHandler,
  TriggerPair,
} from '@harnesys/sdk';
import { type AddonContext, AddonError, defineAddon, startAddonProcess } from '@harnesys/sdk';

const ADDON_ID = 'harnesys.starter';
const ADDON_VERSION = '1.0.3';

function nowIso(): string {
  return new Date().toISOString();
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

const SCHEMA_SQL = `
create table if not exists items (
  id integer primary key,
  text text not null,
  created_at text not null
);
create table if not exists heartbeat (
  at text primary key
);
create table if not exists hook_log (
  id integer primary key,
  at text not null,
  event text not null
);
create table if not exists tool_calls (
  id integer primary key,
  name text not null,
  at text not null
);
create table if not exists trigger_starts (
  instance_id text primary key,
  run_key text not null,
  at text not null
);
create table if not exists trigger_fired (
  run_key text primary key,
  at text not null
);
`;

let schemaReady: Promise<void> | null = null;

function ensureSchema(ctx: AddonContext): Promise<void> {
  schemaReady ??= ctx.db.exec(SCHEMA_SQL).catch((error: unknown) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

async function diagnose<T>(
  work: (ctx: AddonContext) => Promise<T>,
  ctx: AddonContext,
): Promise<T | { status: number; body: Record<string, unknown> }> {
  try {
    return await work(ctx);
  } catch (error) {
    const err = error as Error;
    return {
      status: 500,
      body: {
        error: 'handler failed',
        name: err?.name,
        message: err?.message,
        stack: err?.stack?.split('\n').slice(0, 3),
      },
    };
  }
}

const ping: ToolHandler = async (input, ctx: AddonContext) => {
  await ensureSchema(ctx);
  const message = text(input.message) || 'pong';
  const at = nowIso();
  await ctx.db.run('insert into tool_calls (name, at) values (?, ?)', ['ping', at]);
  await ctx.log.info('tool ping executed', { message });
  return { pong: message, at };
};

const githubUser: ToolHandler = async (input, ctx: AddonContext) => {
  const config = await ctx.config.get(['default_github_login']);
  const login = text(input.login) || text(config.default_github_login);
  if (!login) {
    throw new AddonError('invalid_params', {
      detail: 'login is required: pass input.login or set the default_github_login config value',
    });
  }
  const secret = await ctx.secrets.get('api_note');
  try {
    const response = await ctx.http.fetch({
      url: `https://api.github.com/users/${encodeURIComponent(login)}`,
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': `${ADDON_ID}/${ADDON_VERSION}`,
      },
      auth: { connection: 'github', scheme: 'bearer' },
    });
    await ctx.log.info('github_user fetched', { login, status: response.status });
    let profile: unknown = null;
    try {
      profile = response.body === null ? null : JSON.parse(response.body);
    } catch {
      profile = null;
    }
    return { login, status: response.status, profile, secretConfigured: secret !== null };
  } catch (error) {
    const reason = error instanceof AddonError ? error.reason : 'internal';
    if (reason === 'account_failed') {
      await ctx.log.warn('github_user has no bound account', { login, reason });
      return {
        login,
        status: 'needs_setup',
        detail: 'bind a GitHub account to the github connection',
      };
    }
    if (reason === 'permission_denied') {
      await ctx.log.warn('github_user blocked by egress policy', { login, reason });
      return { login, status: 'blocked', detail: 'http.fetch grant does not cover this host' };
    }
    throw error;
  }
};

const heartbeat: JobHandler = async (_params, ctx: AddonContext) => {
  await ensureSchema(ctx);
  const at = nowIso();
  const result = await ctx.db.run('insert or ignore into heartbeat (at) values (?)', [at]);
  await ctx.log.info('heartbeat', { at, inserted: result.changes });
};

const tick: TriggerPair = {
  start: async (params, ctx: AddonContext) => {
    await ensureSchema(ctx);
    const instanceId = params.instanceId;
    const at = nowIso();
    const existing = await ctx.db.get('select run_key from trigger_starts where instance_id = ?', [
      instanceId,
    ]);
    let runKey = typeof existing?.run_key === 'string' ? existing.run_key : '';
    if (!runKey) {
      runKey = `${instanceId}:${at}`;
      await ctx.db.run('insert into trigger_starts (instance_id, run_key, at) values (?, ?, ?)', [
        instanceId,
        runKey,
        at,
      ]);
    }
    const dedup = await ctx.db.run(
      'insert or ignore into trigger_fired (run_key, at) values (?, ?)',
      [runKey, at],
    );
    if (dedup.changes === 0) {
      await ctx.log.info('trigger start replay suppressed', { instanceId, runKey });
      return;
    }
    const result = await ctx.triggers.fire({ instanceId, runKey, text: 'starter tick' });
    await ctx.log.info('trigger fired', { instanceId, runKey, outcome: result.outcome });
  },
  stop: async (params, ctx: AddonContext) => {
    await ctx.log.info('trigger stopped', { instanceId: params.instanceId });
  },
};

const itemsList: RouteHandler = async (_req, ctx: AddonContext) => {
  await ensureSchema(ctx);
  const rows = await ctx.db.all('select id, text, created_at as createdAt from items order by id');
  return { status: 200, body: { items: rows } };
};

const itemsCreate: RouteHandler = async (req, ctx: AddonContext) => {
  await ensureSchema(ctx);
  const body = (req.request.body ?? {}) as Record<string, unknown>;
  const value = text(body.text);
  if (!value) {
    return { status: 400, body: { error: 'text is required' } };
  }
  const result = await ctx.db.run('insert into items (text, created_at) values (?, ?)', [
    value,
    nowIso(),
  ]);
  return { status: 201, body: { id: result.lastInsertRowid } };
};

const itemGet: RouteHandler = async (req, ctx: AddonContext) => {
  await ensureSchema(ctx);
  const segments = req.request.path.split('/').filter((segment: string) => segment.length > 0);
  const rawId = segments.at(-1) ?? '';
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return { status: 400, body: { error: `invalid item id: ${rawId}` } };
  }
  const row = await ctx.db.get('select id, text, created_at as createdAt from items where id = ?', [
    id,
  ]);
  if (!row) {
    return { status: 404, body: { error: `item not found: ${id}` } };
  }
  return { status: 200, body: row };
};

const onThreadCreated: HookHandler = async (params, ctx: AddonContext) => {
  await ensureSchema(ctx);
  const event = params.event as Record<string, unknown>;
  const name = text(event.name) || 'unknown';
  await ctx.db.run('insert into hook_log (at, event) values (?, ?)', [nowIso(), name]);
  await ctx.log.info('hook delivered', { hookId: params.hookId, event: name });
};

export const addon = defineAddon({
  tools: {
    ping,
    github_user: githubUser,
  },
  routes: {
    'items-list': itemsList,
    'items-create': itemsCreate,
    'item-get': itemGet,
  },
  triggers: {
    'starter.tick': tick,
  },
  jobs: {
    heartbeat,
  },
  hooks: {
    'thread-created': onThreadCreated,
  },
  notifications: {
    'config.changed': async (params, ctx: AddonContext) => {
      await ctx.log.info('config changed', { keys: params.keys });
    },
  },
});

if (import.meta.main) {
  await startAddonProcess({
    definition: addon,
    addon: { id: ADDON_ID, version: ADDON_VERSION },
  });
}
