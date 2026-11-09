import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import type { AddonContext } from './context.ts';
import type { AddonDefinition } from './define.ts';
import { type ConfigField, defaultConfigValues } from './families/config.ts';
import { type JsonRpcError, type JsonRpcRequest, PROTOCOL_VERSION } from './protocol.ts';

type ToolHandle = (
  input: Record<string, unknown>,
  ctx: AddonContext,
) => Promise<{ ok: boolean; text?: string; error?: string }>;

type RouteHandler = (
  request: { method: string; path: string; query: Record<string, unknown>; body?: unknown },
  ctx: AddonContext,
) => Promise<{ status?: number; body?: unknown }> | { status?: number; body?: unknown };

interface ToolEntry {
  readonly name: string;
  readonly handle: ToolHandle;
}

interface RouteEntry {
  readonly method: string;
  readonly path: string;
  readonly handler: RouteHandler;
}

interface ConfigState {
  dataDir: string;
  fields: ConfigField[];
}

async function main(): Promise<void> {
  const addon = await loadAddon();
  const addonId = process.env.HARNESYS_ADDON_ID ?? 'addon';
  const version = process.env.HARNESYS_ADDON_VERSION ?? '0.0.0';
  const dataDir = process.env.HARNESYS_ADDON_DATA_DIR ?? process.cwd();

  const tools: ToolEntry[] = [];
  const routes: RouteEntry[] = [];
  const contributions: Record<string, unknown>[] = [];
  const state: ConfigState = { dataDir, fields: [] };

  const registries = {
    tools: {
      register(contribution: { id: string; tool: { name: string }; handle: ToolHandle }): void {
        tools.push({ name: contribution.tool.name, handle: contribution.handle });
        contributions.push({ id: contribution.id, family: 'tool', descriptor: contribution.tool });
      },
    },
    contents: {
      register(contribution: { id: string; content: unknown }): void {
        contributions.push({
          id: contribution.id,
          family: 'content',
          descriptor: contribution.content,
        });
      },
    },
    views: {
      register(contribution: { id: string; view: unknown }): void {
        contributions.push({ id: contribution.id, family: 'view', descriptor: contribution.view });
      },
    },
    hooks: {
      register(contribution: { id: string; hook: unknown }): void {
        contributions.push({ id: contribution.id, family: 'hook', descriptor: contribution.hook });
      },
    },
    routes: {
      register(contribution: {
        id: string;
        route: { method: string; path: string };
        handler: RouteHandler;
      }): void {
        routes.push({
          method: contribution.route.method,
          path: contribution.route.path,
          handler: contribution.handler,
        });
        contributions.push({
          id: contribution.id,
          family: 'route',
          descriptor: contribution.route,
        });
      },
    },
    workers: {
      register(contribution: { id: string; worker: unknown }): void {
        contributions.push({
          id: contribution.id,
          family: 'worker',
          descriptor: contribution.worker,
        });
      },
    },
    configs: {
      register(contribution: { id: string; config: { fields: ConfigField[] } }): void {
        state.fields = contribution.config.fields;
        contributions.push({
          id: contribution.id,
          family: 'config',
          descriptor: contribution.config,
        });
      },
    },
  };

  const emit = (payload: unknown): void => {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  };

  const notify = (level: string, message: string, fields?: Record<string, unknown>): void => {
    emit({
      jsonrpc: '2.0',
      method: 'log',
      params: { addonId, level, message, fields: fields ?? {} },
    });
  };

  const context: AddonContext = {
    addonId,
    version,
    logger: {
      debug: (message, fields) => notify('debug', message, fields),
      info: (message, fields) => notify('info', message, fields),
      warn: (message, fields) => notify('warn', message, fields),
      error: (message, fields) => notify('error', message, fields),
    },
    secrets: {
      ref(key: string) {
        return { key };
      },
    },
    db: { all: () => [], get: () => undefined, run: () => undefined },
    events: {
      emit(input) {
        emit({
          jsonrpc: '2.0',
          method: 'events.emit',
          params: { addonId, kind: input.kind, action: input.action },
        });
      },
    },
    config: {
      read: () => readConfig(state),
    },
    threads: { create: () => Promise.reject(new Error('host service not wired: threads.create')) },
    runs: { dispatch: () => Promise.reject(new Error('host service not wired: runs.dispatch')) },
  };

  await addon.register(registries as never);

  const dispatch = async (method: string, params: Record<string, unknown>): Promise<unknown> => {
    switch (method) {
      case 'register':
        return { protocolVersion: PROTOCOL_VERSION, addonId, version, contributions };
      case 'config.set': {
        const values = params.values as Record<string, unknown> | undefined;
        if (!values) {
          throw new Error('config.set requires values');
        }
        writeConfig(state, values);
        return { applied: Object.keys(values).length };
      }
      case 'config.get':
        return { values: readConfig(state) };
      case 'tools.call': {
        const name = String(params.name ?? '');
        const tool = tools.find((entry) => entry.name === name);
        if (!tool) {
          throw new Error(`tool not registered: ${name}`);
        }
        return await tool.handle((params.input ?? {}) as Record<string, unknown>, context);
      }
      case 'route.handle': {
        const route = routes.find(
          (entry) => entry.method === params.method && entry.path === params.path,
        );
        if (!route) {
          throw new Error(`route not registered: ${String(params.method)} ${String(params.path)}`);
        }
        return await route.handler(
          {
            method: String(params.method),
            path: String(params.path),
            query: (params.query ?? {}) as Record<string, unknown>,
            body: params.body,
          },
          context,
        );
      }
      case 'shutdown':
        setTimeout(() => process.exit(0), 25).unref();
        return { ok: true };
      default:
        throw new Error(`unknown method: ${method}`);
    }
  };

  const respond = (id: number | string, result?: unknown, error?: JsonRpcError): void => {
    const body = error
      ? { jsonrpc: '2.0', id, error }
      : { jsonrpc: '2.0', id, result: result ?? null };
    emit(body);
  };

  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    let request: JsonRpcRequest;
    try {
      request = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      return;
    }
    const params = (request.params ?? {}) as Record<string, unknown>;
    const method = String(params.method ?? request.method);
    void dispatch(method, params)
      .then((result) => respond(request.id, result))
      .catch((error: unknown) =>
        respond(request.id, undefined, {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
  });

  notify('info', 'addon process ready', { addonId, version });
}

async function loadAddon(): Promise<AddonDefinition> {
  const entry = process.env.HARNESYS_ADDON_ENTRY;
  if (!entry) {
    throw new Error('HARNESYS_ADDON_ENTRY is not set');
  }
  const module = (await import(entry)) as { addon?: AddonDefinition };
  if (!module.addon) {
    throw new Error(`addon entry has no named export "addon": ${entry}`);
  }
  return module.addon;
}

function configPath(state: ConfigState): string {
  return join(state.dataDir, 'config.json');
}

function writeConfig(state: ConfigState, values: Record<string, unknown>): void {
  const merged = { ...defaultValues(state), ...values };
  mkdirSync(dirname(configPath(state)), { recursive: true });
  writeFileSync(configPath(state), `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
}

function readConfig(state: ConfigState): Record<string, unknown> {
  const path = configPath(state);
  if (!existsSync(path)) {
    return defaultValues(state);
  }
  return {
    ...defaultValues(state),
    ...(JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>),
  };
}

function defaultValues(state: ConfigState): Record<string, unknown> {
  return defaultConfigValues(state.fields);
}

void main();
