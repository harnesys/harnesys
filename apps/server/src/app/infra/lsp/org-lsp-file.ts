import { accessSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import type { PluginDiagnostic } from '@harnesys/contracts';

export interface LspServerSpec {
  serverId: string;
  command: string;
  args?: string[];
  extensionToLanguage: Record<string, string>;
}

export interface OrgLspFile {
  raw: unknown;
  servers: LspServerSpec[];
  diagnostics: PluginDiagnostic[];
}

export function readLspJsonText(text: string, pathLabel: string): OrgLspFile {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { raw: {}, servers: [], diagnostics: [] };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed) as unknown;
  } catch (error) {
    return {
      raw: {},
      servers: [],
      diagnostics: [
        {
          level: 'error',
          code: 'server_config_invalid',
          message: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
          path: pathLabel,
        },
      ],
    };
  }
  const record = isRecord(raw) ? (raw.servers ?? raw) : raw;
  const parsed = parseLspServers(record, pathLabel);
  const servers = parsed.servers.filter((spec) => !isFileDisabled(record, spec.serverId));
  return { raw, servers, diagnostics: parsed.diagnostics };
}

export function readOrgLspFile(path: string): OrgLspFile {
  if (!existsSync(path)) {
    return { raw: {}, servers: [], diagnostics: [] };
  }
  return readLspJsonText(readFileSync(path, 'utf8'), path);
}

export function writeOrgLspFile(path: string, raw: unknown): void {
  const record = isRecord(raw) ? (raw.servers ?? raw) : raw;
  const parsed = parseLspServers(record, path);
  if (parsed.diagnostics.length > 0) {
    const details = parsed.diagnostics
      .map((diagnostic) => `${diagnostic.path ?? path}: ${diagnostic.message}`)
      .join('; ');
    throw new Error(`invalid LSP config: ${details}`);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
}

export function parseLspServers(
  record: unknown,
  pathLabel: string,
): {
  servers: LspServerSpec[];
  diagnostics: PluginDiagnostic[];
} {
  const diagnostics: PluginDiagnostic[] = [];
  const servers: LspServerSpec[] = [];
  if (record === undefined || record === null) {
    return { servers, diagnostics };
  }
  if (!isRecord(record)) {
    diagnostics.push(invalidDiag(pathLabel, 'LSP servers must be an object'));
    return { servers, diagnostics };
  }
  for (const [serverId, value] of Object.entries(record)) {
    const parsed = parseServerEntry(serverId, value, pathLabel);
    if ('diagnostic' in parsed) {
      diagnostics.push(parsed.diagnostic);
      continue;
    }
    servers.push(parsed.spec);
  }
  return { servers, diagnostics };
}

export function isFileDisabled(raw: unknown, serverId: string): boolean {
  const record = containerOf(raw);
  if (!record) {
    return false;
  }
  const entry = record[serverId];
  return isRecord(entry) && entry.disabled === true;
}

export function disabledFileEntries(raw: unknown): LspServerSpec[] {
  const record = containerOf(raw);
  if (!record) {
    return [];
  }
  const servers: LspServerSpec[] = [];
  for (const [serverId, value] of Object.entries(record)) {
    if (!isRecord(value) || value.disabled !== true) {
      continue;
    }
    const parsed = parseServerEntry(serverId, value, '');
    if ('spec' in parsed) {
      servers.push(parsed.spec);
    }
  }
  return servers;
}

export function withFileDisabled(
  raw: unknown,
  serverId: string,
  fallback: {
    command: string;
    args?: string[];
    extensionToLanguage: Record<string, string>;
  },
  disabled: boolean,
): unknown {
  const next = { ...fallback, disabled };
  if (isRecord(raw) && isRecord(raw.servers)) {
    const servers = { ...(raw.servers as Record<string, unknown>) };
    const existing = servers[serverId];
    return {
      ...raw,
      servers: {
        ...servers,
        [serverId]: { ...(isRecord(existing) ? existing : next), disabled },
      },
    };
  }
  if (isRecord(raw)) {
    const existing = raw[serverId];
    return { ...raw, [serverId]: { ...(isRecord(existing) ? existing : next), disabled } };
  }
  return { [serverId]: next };
}

export function withServerUpsert(
  raw: unknown,
  serverId: string,
  spec: { command: string; args?: string[]; extensionToLanguage: Record<string, string> },
): unknown {
  if (isRecord(raw) && isRecord(raw.servers)) {
    const servers = { ...(raw.servers as Record<string, unknown>) };
    servers[serverId] = spec;
    return { ...raw, servers };
  }
  if (isRecord(raw)) {
    return { ...raw, [serverId]: spec };
  }
  return { [serverId]: spec };
}

export function withoutServer(raw: unknown, serverId: string): unknown {
  if (isRecord(raw) && isRecord(raw.servers)) {
    const servers = { ...(raw.servers as Record<string, unknown>) };
    delete servers[serverId];
    return { ...raw, servers };
  }
  if (isRecord(raw)) {
    const next = { ...raw };
    delete next[serverId];
    return next;
  }
  return raw;
}

export function fileHasServer(file: OrgLspFile, serverId: string): boolean {
  if (file.servers.some((server) => server.serverId === serverId)) {
    return true;
  }
  const record = containerOf(file.raw);
  if (record === undefined) {
    return false;
  }
  const entry = record[serverId];
  return isRecord(entry);
}

export function hasBinary(command: string): boolean {
  if (command.includes('/') || command.includes('\\')) {
    return isExecutable(command);
  }
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (dir.length > 0 && isExecutable(join(dir, command))) {
      return true;
    }
  }
  return false;
}

function parseServerEntry(
  serverId: string,
  value: unknown,
  pathLabel: string,
): { spec: LspServerSpec } | { diagnostic: PluginDiagnostic } {
  if (!isRecord(value)) {
    return { diagnostic: invalidDiag(pathLabel, `server "${serverId}" must be an object`) };
  }
  const command = typeof value.command === 'string' ? value.command.trim() : '';
  if (command.length === 0) {
    return { diagnostic: invalidDiag(pathLabel, `server "${serverId}" requires command`) };
  }
  const extensionToLanguage = parseExtensionMap(value.extensionToLanguage);
  const spec: LspServerSpec = { serverId, command, extensionToLanguage };
  if (Array.isArray(value.args)) {
    spec.args = value.args.filter((item): item is string => typeof item === 'string');
  }
  return { spec };
}

export function parseExtensionMap(value: unknown): Record<string, string> {
  const extensionToLanguage: Record<string, string> = {};
  if (!isRecord(value)) {
    return extensionToLanguage;
  }
  for (const [ext, languageId] of Object.entries(value)) {
    if (typeof languageId === 'string' && languageId.trim().length > 0) {
      const key = ext.startsWith('.') ? ext : `.${ext}`;
      extensionToLanguage[key] = languageId.trim();
    }
  }
  return extensionToLanguage;
}

function invalidDiag(pathLabel: string, message: string): PluginDiagnostic {
  return {
    level: 'error',
    code: 'server_config_invalid',
    message,
    ...(pathLabel ? { path: pathLabel } : {}),
  };
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function containerOf(raw: unknown): Record<string, unknown> | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const inner = raw.servers;
  if (inner !== undefined) {
    return isRecord(inner) ? inner : undefined;
  }
  return raw;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
