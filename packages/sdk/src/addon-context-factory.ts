import type {
  AddonConfig,
  AddonContext,
  AddonDb,
  AddonEvents,
  AddonFiles,
  AddonHttp,
  AddonLog,
  AddonLogLevel,
  AddonSecrets,
  DbStatement,
  DbWriteResult,
  SqlParam,
} from './addon-context.ts';
import type { HostServiceClient } from './protocol/map.ts';
import type { CallMeta } from './protocol/meta.ts';

export type {
  AddonAccounts,
  AddonBindings,
  AddonBridge,
  AddonConfig,
  AddonContext,
  AddonDb,
  AddonEvents,
  AddonFileChunk,
  AddonFileStat,
  AddonFiles,
  AddonFileWriteResult,
  AddonHttp,
  AddonInboundAttachment,
  AddonLog,
  AddonLogLevel,
  AddonProgress,
  AddonRuns,
  AddonSecrets,
  AddonThreads,
  AddonTriggers,
  AddonWorkers,
  DbRow,
  DbStatement,
  DbWriteResult,
  SqlParam,
} from './addon-context.ts';

function createDb(client: HostServiceClient, _meta: CallMeta, signal: AbortSignal): AddonDb {
  const track = async <T>(promise: Promise<T>): Promise<T> => {
    if (signal.aborted) {
      throw new Error('cancelled');
    }
    return promise;
  };
  return {
    exec: async (sql: string) => {
      await track(client['db.exec']({ sql }, { signal }));
    },
    all: async (sql: string, params?: SqlParam[]) => {
      const result = await track(client['db.all']({ sql, params }, { signal }));
      return result.rows;
    },
    get: async (sql: string, params?: SqlParam[]) => {
      const result = await track(client['db.get']({ sql, params }, { signal }));
      return result.row;
    },
    run: async (sql: string, params?: SqlParam[]): Promise<DbWriteResult> => {
      const result = await track(client['db.run']({ sql, params }, { signal }));
      return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
    },
    batch: async (statements: DbStatement[]): Promise<DbWriteResult[]> => {
      const result = await track(client['db.batch']({ statements }, { signal }));
      return result.results.map((entry) => ({
        changes: entry.changes,
        lastInsertRowid: entry.lastInsertRowid,
      }));
    },
  };
}

function createLog(
  client: HostServiceClient,
  level: AddonLogLevel,
): (message: string, fields?: Record<string, unknown>) => Promise<void> {
  return async (message, fields) => {
    await client['log.write']({ level, message, fields });
  };
}

export type ProgressNotify = (method: string, params: unknown) => void;

export function createAddonContext(
  client: HostServiceClient,
  meta: CallMeta,
  signal: AbortSignal,
  notify?: ProgressNotify,
): AddonContext {
  const config: AddonConfig = {
    get: async (keys?: string[]) => {
      const result = await client['config.get']({ keys }, { signal });
      return result.values;
    },
  };
  const secrets: AddonSecrets = {
    get: async (key: string) => {
      const result = await client['secrets.get']({ key }, { signal });
      return result.value;
    },
    set: async (key: string, value: string) => {
      await client['secrets.set']({ key, value }, { signal });
    },
    delete: async (key: string) => {
      await client['secrets.delete']({ key }, { signal });
    },
  };
  const log: AddonLog = {
    debug: createLog(client, 'debug'),
    info: createLog(client, 'info'),
    warn: createLog(client, 'warn'),
    error: createLog(client, 'error'),
  };
  const events: AddonEvents = {
    emit: async (name: string, payload: unknown) => {
      await client['events.emit']({ name, payload }, { signal });
    },
  };
  const http: AddonHttp = {
    fetch: async (params) =>
      client['http.fetch']({ ...params, method: params.method ?? 'GET' }, { signal }),
  };
  const files: AddonFiles = {
    stat: async (path: string) => client['files.stat']({ path }, { signal }),
    read: async (params) => client['files.read'](params, { signal }),
    write: async (params) => client['files.write'](params, { signal }),
  };
  const bindings = {
    channels: async (provider?: string) => {
      const result = await client['bindings.channels']({ provider }, { signal });
      return result.channels;
    },
  };
  const accounts = {
    list: async (connection: string) => {
      const result = await client['accounts.list']({ connection }, { signal });
      return result.accounts;
    },
    report: async (connection: string, code: string, accountId?: string) => {
      await client['accounts.report']({ connection, code, accountId }, { signal });
    },
    access: async (connection: string, accountId?: string) => {
      const result = await client['accounts.access']({ connection, accountId }, { signal });
      return { credentials: result.credentials, expiresAt: result.expiresAt, app: result.app };
    },
  };
  return {
    meta,
    signal,
    config,
    secrets,
    db: createDb(client, meta, signal),
    log,
    events,
    http,
    files,
    accounts,
    bindings,
    runs: {
      dispatch: async (params) => client['runs.dispatch'](params, { signal }),
      cancel: async (params) => client['runs.cancel'](params, { signal }),
    },
    threads: {
      create: async (params: { title?: string; agentId: string }) =>
        client['threads.create'](params, { signal }),
    },
    triggers: {
      fire: async (params) => client['triggers.fire'](params, { signal }),
    },
    bridge: {
      inbound: async (message) => {
        await client['bridge.inbound']({ message }, { signal });
      },
    },
    progress: {
      progress: (token: string, value: unknown) => {
        notify?.('$/progress', { token, value });
      },
    },
    workers: {
      report: async (workerId: string, state: 'running' | 'stopped' | 'failed', code?: string) => {
        await client['workers.report']({ workerId, state, code }, { signal });
      },
      lease: async (workerId: string, ttlMs?: number) =>
        client['workers.lease']({ workerId, ttlMs }, { signal }),
      release: async (workerId: string) => {
        await client['workers.release']({ workerId }, { signal });
      },
    },
  };
}
