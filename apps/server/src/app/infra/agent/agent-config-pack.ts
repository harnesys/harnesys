import type {
  AgentHook,
  AgentLevel,
  AgentSourceLevel,
  AgentStatus,
  WorkspaceRef,
} from '@harnesys/contracts';
import { AgentHookSchema, HookEventNameSchema } from '@harnesys/contracts';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import type { AgentRow } from '../org-sqlite/schema/index.ts';
import {
  mapLegacyDirectory,
  parseWorkspaceRef,
  projectLegacyRunDirectory,
  type SourceRoot,
} from '../thread/legacy-workspace-ref.ts';

const CONFIG_SKILLS = 'skills';
const CONFIG_MCP = 'mcpServers';
const CONFIG_PLUGINS = 'enabledPlugins';
const CONFIG_DEFAULT_MODE = 'defaultModeId';
const CONFIG_DEFAULT_RUN_DIRECTORY = 'defaultRunDirectory';
const CONFIG_DEFAULT_WORKSPACE_REF = 'defaultWorkspaceRef';
const CONFIG_HOOKS = 'hooksJson';
const CONFIG_HOOKS_LEGACY = 'hooks';
const CONFIG_SHARED_SOURCES = 'sharedSourceIds';
const CONFIG_SOURCE_LEVELS = 'sourceLevels';
const CONFIG_SECRET_NAMES = 'secretNames';

export function packConfig(rec: AgentRecord, sourceRoots: SourceRoot[]): Record<string, unknown> {
  const defaultWorkspaceRef = rec.defaultWorkspaceRef ?? null;
  return {
    ...rec.config,
    [CONFIG_SKILLS]: rec.skills,
    [CONFIG_MCP]: rec.mcpServers,
    [CONFIG_PLUGINS]: rec.enabledPlugins,
    [CONFIG_DEFAULT_MODE]: rec.defaultModeId,
    [CONFIG_DEFAULT_RUN_DIRECTORY]:
      (defaultWorkspaceRef === null
        ? null
        : projectLegacyRunDirectory(defaultWorkspaceRef, sourceRoots)) ?? rec.defaultRunDirectory,
    [CONFIG_DEFAULT_WORKSPACE_REF]: defaultWorkspaceRef,
    [CONFIG_HOOKS]: rec.hooks,
    [CONFIG_SHARED_SOURCES]: rec.sharedSourceIds,
    [CONFIG_SOURCE_LEVELS]: rec.sourceLevels,
    [CONFIG_SECRET_NAMES]: rec.secretNames,
  };
}

export function toRecord(row: AgentRow, sourceRoots: SourceRoot[]): AgentRecord {
  const packed = parseObject(row.config);
  const skills = parseStringArray(packed[CONFIG_SKILLS]);
  const mcpServers = parseStringArray(packed[CONFIG_MCP]);
  const enabledPlugins = parseBooleanRecord(packed[CONFIG_PLUGINS]);
  const defaultModeId = parseNullableString(packed[CONFIG_DEFAULT_MODE]);
  const hooks = parseHooks(packed[CONFIG_HOOKS] ?? packed[CONFIG_HOOKS_LEGACY]);
  const sharedSourceIds = parseStringArray(packed[CONFIG_SHARED_SOURCES]);
  const sourceLevels = parseLevelRecord(packed[CONFIG_SOURCE_LEVELS]);
  const secretNames = parseStringArray(packed[CONFIG_SECRET_NAMES]);
  const defaultRunDirectory = parseNullableString(packed[CONFIG_DEFAULT_RUN_DIRECTORY]);
  const config = omitConfigKeys(packed, [
    CONFIG_SKILLS,
    CONFIG_MCP,
    CONFIG_PLUGINS,
    CONFIG_DEFAULT_MODE,
    CONFIG_DEFAULT_RUN_DIRECTORY,
    CONFIG_DEFAULT_WORKSPACE_REF,
    CONFIG_HOOKS,
    CONFIG_HOOKS_LEGACY,
    CONFIG_SHARED_SOURCES,
    CONFIG_SOURCE_LEVELS,
    CONFIG_SECRET_NAMES,
  ]);
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    role: row.role,
    instructions: row.instructions,
    modelId: row.model,
    budgetUsdDaily: row.budgetUsdDaily ?? null,
    level: row.level as AgentLevel,
    parentId: row.parentId,
    executionProfileId: row.executionProfileId ?? null,
    status: row.status as AgentStatus,
    sharedSourceIds,
    sourceLevels,
    secretNames,
    skills,
    mcpServers,
    enabledPlugins,
    defaultModeId,
    defaultRunDirectory,
    defaultWorkspaceRef: workspaceRefOf(packed, defaultRunDirectory, sourceRoots),
    config,
    hooks,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function workspaceRefOf(
  packed: Record<string, unknown>,
  defaultRunDirectory: string | null,
  sourceRoots: SourceRoot[],
): WorkspaceRef | null {
  const parsed = parseWorkspaceRef(packed[CONFIG_DEFAULT_WORKSPACE_REF]);
  if (parsed !== null) {
    return parsed;
  }
  if (defaultRunDirectory === null || defaultRunDirectory.length === 0) {
    return null;
  }
  return mapLegacyDirectory({ runDirectory: defaultRunDirectory, sourceRoots });
}

function parseHooks(value: unknown): AgentHook[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const hooks: AgentHook[] = [];
  value.forEach((entry, index) => {
    const parsed = parseHook(entry);
    if (parsed === undefined) {
      return;
    }
    hooks.push(
      parsed.id === undefined ? { ...parsed, id: `legacy-${parsed.event}-${index}` } : parsed,
    );
  });
  return hooks;
}

function parseHook(entry: unknown): AgentHook | undefined {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return undefined;
  }
  const row = entry as Record<string, unknown>;
  const event = typeof row.event === 'string' ? row.event : undefined;
  if (event === undefined || !HookEventNameSchema.safeParse(event).success) {
    return undefined;
  }
  const result = AgentHookSchema.safeParse({ ...row, event });
  if (!result.success) {
    return undefined;
  }
  return result.data;
}

function omitConfigKeys(packed: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...packed };
  for (const key of keys) {
    delete out[key];
  }
  return out;
}

function parseObject(raw: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function parseBooleanRecord(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'boolean') {
      out[key] = entry;
    }
  }
  return out;
}

function parseLevelRecord(value: unknown): Record<string, AgentSourceLevel> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, AgentSourceLevel> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === 'read' || entry === 'edit') {
      out[key] = entry;
    }
  }
  return out;
}

function parseNullableString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  return null;
}
