import type { UpsertProjectMcpServerRequest } from '@harnesys/studio-shared';
import { z } from 'zod';
import {
  type McpFieldsInput,
  type McpServerDraft,
  mcpFieldsSchema,
  toMcpServerDraft,
} from './mcp-fields';

export type McpTransportKind = 'stdio' | 'http' | 'sse';

const serverIdSchema = z
  .string()
  .trim()
  .min(1, 'Server id required')
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'Letters, digits, ., _, -');

const mcpJsonBaseSchema = z.object({
  serverId: serverIdSchema,
  enabled: z.boolean(),
  transport: z.enum(['stdio', 'http', 'sse']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  url: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

const looseServerSchema = z.object({
  enabled: z.boolean().optional(),
  transport: z.enum(['stdio', 'http', 'sse']).optional(),
  type: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  url: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

export type McpJsonServer = z.infer<typeof mcpJsonBaseSchema>;

export type McpJsonParseResult =
  | { ok: true; json: McpJsonServer; draft: McpServerDraft }
  | { ok: false; error: string };

export function parseMcpJsonDraft(text: string, lockedServerId?: string): McpJsonParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : 'Invalid JSON' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Server JSON must be an object' };
  }
  const record = raw as Record<string, unknown>;
  if ('serverId' in record || 'command' in record || 'url' in record) {
    return parseSingleConfig(record, record.serverId, lockedServerId);
  }
  const wrapped =
    record.mcpServers && typeof record.mcpServers === 'object' && !Array.isArray(record.mcpServers)
      ? (record.mcpServers as Record<string, unknown>)
      : record;
  const entries = Object.entries(wrapped);
  if (entries.length === 0) {
    return { ok: false, error: 'No servers found in JSON' };
  }
  if (entries.length > 1) {
    return {
      ok: false,
      error: `${entries.length} servers found, add them one by one`,
    };
  }
  const [serverId, config] = entries[0] as [string, unknown];
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return { ok: false, error: `${serverId}: server config must be an object` };
  }
  return parseSingleConfig(config as Record<string, unknown>, serverId, lockedServerId);
}

function parseSingleConfig(
  config: Record<string, unknown>,
  serverId: unknown,
  lockedServerId?: string,
): McpJsonParseResult {
  const idResult = serverIdSchema.safeParse(serverId);
  if (!idResult.success) {
    return { ok: false, error: formatIssues(idResult.error.issues) };
  }
  const parsed = looseServerSchema.safeParse(config);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }
  const loose = parsed.data;
  if (lockedServerId !== undefined && idResult.data !== lockedServerId) {
    return { ok: false, error: 'Server id is fixed after create.' };
  }
  const command = loose.command?.trim() ?? '';
  const url = loose.url?.trim() ?? '';
  const transport = loose.transport ?? inferTransport(loose.type, command, url);
  if (transport === undefined) {
    return { ok: false, error: 'command or url: server needs a command or a url' };
  }
  if (transport === 'stdio' && command === '') {
    return { ok: false, error: 'command: Command required for stdio' };
  }
  if (transport !== 'stdio' && url === '') {
    return { ok: false, error: 'url: URL required' };
  }
  const json: McpJsonServer = {
    serverId: idResult.data,
    enabled: loose.enabled ?? true,
    transport,
    ...(transport === 'stdio'
      ? {
          ...(command !== '' ? { command } : {}),
          ...(loose.args !== undefined ? { args: loose.args } : {}),
          ...(loose.env !== undefined ? { env: loose.env } : {}),
        }
      : {
          ...(url !== '' ? { url } : {}),
          ...(loose.headers !== undefined ? { headers: loose.headers } : {}),
        }),
  };
  return { ok: true, json, draft: jsonToDraft(json) };
}

function inferTransport(
  type: string | undefined,
  command: string,
  url: string,
): McpTransportKind | undefined {
  if (type === 'stdio' || type === 'sse' || type === 'http' || type === 'streamable-http') {
    if (type === 'stdio' || type === 'sse') {
      return type;
    }
    return 'http';
  }
  if (command !== '') {
    return 'stdio';
  }
  if (url !== '') {
    return 'http';
  }
  return undefined;
}

export function mcpDraftToJson(draft: McpServerDraft): string {
  return `${JSON.stringify({ serverId: draft.serverId, ...draft.body }, null, 2)}\n`;
}

export function mcpFieldsInputToJson(input: McpFieldsInput): string {
  const validated = mcpFieldsSchema.safeParse(input);
  if (validated.success) {
    return mcpDraftToJson(toMcpServerDraft(validated.data));
  }
  return `${JSON.stringify(inputToJson(input), null, 2)}\n`;
}

export function mcpJsonToFields(json: McpJsonServer): McpFieldsInput {
  return {
    serverId: json.serverId,
    enabled: json.enabled,
    transport: json.transport,
    command: json.command ?? '',
    argsText: (json.args ?? []).join('\n'),
    envText: Object.entries(json.env ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join('\n'),
    url: json.url ?? '',
    headersText: Object.entries(json.headers ?? {})
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n'),
  };
}

function jsonToDraft(json: McpJsonServer): McpServerDraft {
  const body: UpsertProjectMcpServerRequest = {
    enabled: json.enabled,
    transport: json.transport,
  };
  if (json.transport === 'stdio') {
    body.command = (json.command ?? '').trim();
    if (json.args !== undefined && json.args.length > 0) {
      body.args = json.args;
    }
    if (json.env !== undefined && Object.keys(json.env).length > 0) {
      body.env = json.env;
    }
  } else {
    body.url = (json.url ?? '').trim();
    if (json.headers !== undefined && Object.keys(json.headers).length > 0) {
      body.headers = json.headers;
    }
  }
  return { serverId: json.serverId, body };
}

function inputToJson(input: McpFieldsInput): Record<string, unknown> {
  return {
    serverId: input.serverId,
    enabled: input.enabled,
    transport: input.transport,
    ...(input.transport === 'stdio'
      ? {
          command: input.command,
          args: splitLines(input.argsText),
          env: input.envText,
        }
      : {
          url: input.url,
          headers: input.headersText,
        }),
  };
}

function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function formatIssues(issues: z.ZodIssue[]): string {
  const first = issues[0];
  if (!first) {
    return 'Invalid server JSON';
  }
  const path = first.path.map((part) => String(part)).join('.');
  return path ? `${path}: ${first.message}` : first.message;
}
