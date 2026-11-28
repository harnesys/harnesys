import type { CursorMcpJson, McpServerEntries, StdioEntry, UrlEntry } from 'harnesys';

const PLACEHOLDER_PATTERN = /\$\{(secret|var):([^}]+)\}/g;

export type McpVaultLookup = (key: string) => Promise<string | null>;

export type McpResolveWarn = (message: string) => void;

export function vaultKeyMissingMessage(serverId: string, key: string): string {
  return `vault key "${key}" not found for server ${serverId} — set it in the vault or fix the \${${key}} reference`;
}

export class McpVaultKeyNotFoundError extends Error {
  constructor(serverId: string, key: string) {
    super(vaultKeyMissingMessage(serverId, key));
    this.name = 'McpVaultKeyNotFoundError';
  }
}

export interface McpVaultSkip {
  serverId: string;
  error: string;
}

export interface ResolvedMcpVault {
  mcpJson: CursorMcpJson;
  skipped: McpVaultSkip[];
}

export async function resolveMcpVaultJson(
  mcpJson: CursorMcpJson,
  lookup: McpVaultLookup,
  warn: McpResolveWarn,
): Promise<ResolvedMcpVault> {
  const servers: McpServerEntries = {};
  const skipped: McpVaultSkip[] = [];
  for (const [serverId, entry] of Object.entries(mcpJson.mcpServers)) {
    try {
      servers[serverId] = await resolveMcpVaultEntry(serverId, entry, lookup, warn);
    } catch (err) {
      if (!(err instanceof McpVaultKeyNotFoundError)) {
        throw err;
      }
      skipped.push({ serverId, error: err.message });
    }
  }
  return { mcpJson: { mcpServers: servers }, skipped };
}

export async function resolveMcpVaultEntry(
  serverId: string,
  entry: StdioEntry | UrlEntry,
  lookup: McpVaultLookup,
  warn: McpResolveWarn,
): Promise<StdioEntry | UrlEntry> {
  if ('url' in entry) {
    const url = await resolveValue(serverId, 'url', entry.url, lookup, warn);
    const headers = await resolveRecord(serverId, 'headers', entry.headers, lookup, warn);
    return {
      ...entry,
      url,
      ...(headers === undefined ? {} : { headers }),
    };
  }
  const command = await resolveValue(serverId, 'command', entry.command, lookup, warn);
  const out: StdioEntry = { ...entry, command };
  if (entry.cwd !== undefined) {
    out.cwd = await resolveValue(serverId, 'cwd', entry.cwd, lookup, warn);
  }
  if (entry.args !== undefined) {
    out.args = await Promise.all(
      entry.args.map((arg) => resolveValue(serverId, 'args', arg, lookup, warn)),
    );
  }
  const env = await resolveRecord(serverId, 'env', entry.env, lookup, warn);
  if (env !== undefined) {
    out.env = env;
  }
  return out;
}

async function resolveRecord(
  serverId: string,
  field: string,
  record: Record<string, string> | undefined,
  lookup: McpVaultLookup,
  warn: McpResolveWarn,
): Promise<Record<string, string> | undefined> {
  if (record === undefined) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = await resolveValue(serverId, `${field}.${key}`, value, lookup, warn);
  }
  return out;
}

async function resolveValue(
  serverId: string,
  field: string,
  value: string,
  lookup: McpVaultLookup,
  warn: McpResolveWarn,
): Promise<string> {
  if (!value.includes('${')) {
    return value;
  }
  const matches = [...value.matchAll(PLACEHOLDER_PATTERN)];
  if (matches.length === 0) {
    return value;
  }
  const parts: string[] = [];
  let cursor = 0;
  for (const match of matches) {
    const kind = match[1] ?? 'secret';
    const name = match[2]?.trim() ?? '';
    parts.push(value.slice(cursor, match.index ?? 0));
    parts.push(await resolvePlaceholder(serverId, field, `${kind}:${name}`, lookup, warn));
    cursor = (match.index ?? 0) + match[0].length;
  }
  parts.push(value.slice(cursor));
  return parts.join('');
}

async function resolvePlaceholder(
  serverId: string,
  field: string,
  key: string,
  lookup: McpVaultLookup,
  warn: McpResolveWarn,
): Promise<string> {
  const stored = await lookup(key);
  if (stored === null) {
    const error = new McpVaultKeyNotFoundError(serverId, key);
    warn(`${serverId}: ${field}: ${error.message}`);
    throw error;
  }
  return stored;
}
