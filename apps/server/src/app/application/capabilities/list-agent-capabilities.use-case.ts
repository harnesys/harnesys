import { Injectable } from '@harnesys/brix';
import type {
  AgentCapabilitiesView,
  AgentCapabilityRegistryEntry,
  AgentHook,
  ExplainEntry,
  PackCatalogEntry,
} from '@harnesys/contracts';
import type { ExplainStatus, HookGateStatus, PermissionMap } from 'harnesys';
import { hookGateStatus } from 'harnesys';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import type { LoadedOrgPlugin } from '../../domain/plugin/plugin-runtime.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { isHostWired } from '../../infra/runtime/packs/org-pack-list.ts';
import { requireAgent } from '../agents/agent.helpers.ts';
import { pluginHookBindings } from '../plugins/plugin-grant-gate.ts';
import { listOrgPackCatalog } from './org-pack-catalog.ts';

export interface ListAgentCapabilitiesRequest {
  orgId: string;
  agentId: string;
}

@Injectable()
export class ListAgentCapabilitiesUseCase {
  constructor(
    private readonly agents: AgentRegistryPort,
    private readonly pluginRuntime: PluginRuntimePort,
  ) {}

  async execute(request: ListAgentCapabilitiesRequest): Promise<AgentCapabilitiesView> {
    const agent = requireAgent(this.agents, request.orgId, request.agentId);
    const packs = packMapOf(agent.config);
    const explain: ExplainEntry[] = [];
    const registry: AgentCapabilityRegistryEntry[] = [];

    for (const pack of listOrgPackCatalog()) {
      pushPackEntries(explain, registry, pack, packs);
    }

    const bundle = await this.pluginRuntime.bundle(request.orgId);
    for (const entry of bundle.entries) {
      pushPluginEntries(explain, agent.enabledPlugins ?? {}, entry);
    }

    pushAgentHookEntries(explain, agent);

    for (const entry of bundle.entries) {
      if (agent.enabledPlugins?.[entry.record.name] !== true) {
        continue;
      }
      for (const binding of pluginHookBindings(entry.ir, entry.userConfig)) {
        explain.push({
          item: `${binding.event}→${binding.handler.type}`,
          kind: 'hook',
          source: `plugin:${entry.record.name}`,
          status: 'granted',
          reason: 'plugin hooks binding',
        });
      }
    }

    const subagents = this.agents
      .list(request.orgId)
      .filter((row) => row.parentId === agent.id)
      .map((row) => ({
        id: row.id,
        name: row.name,
        parentId: row.parentId,
      }));

    return { explain, registry, subagents };
  }
}

function pushAgentHookEntries(explain: ExplainEntry[], agent: AgentRecord): void {
  const permissions = permissionsOf(agent.config);
  for (const hook of agent.hooks) {
    const gate = hookGateStatus(hook.handler, permissions);
    explain.push({
      item: `${hook.event}→${hook.handler.type}`,
      kind: 'hook',
      source: 'agent',
      status: hookStatus(hook, gate),
      reason: hookReason(hook, gate),
    });
  }
}

function hookStatus(hook: AgentHook, gate: { status: 'granted' | 'denied' }): ExplainStatus {
  if (hook.enabled === false) {
    return 'disabled';
  }
  return gate.status === 'denied' ? 'denied-by-permission' : 'granted';
}

function hookReason(hook: AgentHook, gate: HookGateStatus): string {
  if (hook.enabled === false) {
    return 'hook disabled';
  }
  return gate.reason ?? 'agent hook';
}

function pushPluginEntries(
  explain: ExplainEntry[],
  enabledPlugins: Record<string, boolean>,
  entry: LoadedOrgPlugin,
): void {
  if (enabledPlugins[entry.record.name] !== true) {
    return;
  }
  const source = `plugin:${entry.record.name}`;
  for (const component of entry.ir.components) {
    const mapped = mapPluginComponent(component);
    if (!mapped) {
      continue;
    }
    const native = component.status === 'native';
    let reason = 'plugin component';
    if (!native) {
      reason =
        component.status === 'blocked_by_grant'
          ? `blocked_by_grant${typeof component.inertReason === 'string' ? ` (${component.inertReason})` : ''}`
          : `plugin component ${component.status}`;
    }
    explain.push({
      item: mapped.item,
      kind: mapped.kind,
      source,
      status: native ? 'granted' : 'denied-by-universe',
      reason,
    });
  }
}

const TOOL_EXPLAIN_REASONS: Record<string, string> = {
  recall_search: 'episodic full-text scan',
};

function pushPackEntries(
  explain: ExplainEntry[],
  registry: AgentCapabilityRegistryEntry[],
  pack: PackCatalogEntry,
  packs: Record<string, unknown>,
): void {
  const granted = pack.name === 'core' || isGranted(packs[pack.name]);
  if (!granted) {
    return;
  }
  const source = `pack:${pack.name}`;
  if (!isHostWired(pack.name)) {
    for (const tool of pack.tools) {
      explain.push({
        item: tool.name,
        kind: 'tool',
        source,
        status: 'denied-by-universe',
        reason: 'pack not wired by host',
      });
    }
    return;
  }
  const override = overrideOf(packs[pack.name]);
  for (const tool of pack.tools) {
    const disabled = override.disabledTools?.includes(tool.name) ?? false;
    explain.push({
      item: tool.name,
      kind: 'tool',
      source,
      status: disabled ? 'disabled' : 'granted',
      reason: disabled
        ? 'disabled in pack override'
        : (TOOL_EXPLAIN_REASONS[tool.name] ?? 'agent pack grant'),
    });
    registry.push({
      name: tool.name,
      exposure: override.exposure?.[tool.name] ?? 'direct',
      source,
    });
  }
}

function packMapOf(config: Record<string, unknown>): Record<string, unknown> {
  const raw = config.capabilitiesJson ?? config.packs;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  return raw as Record<string, unknown>;
}

function isGranted(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false;
}

function overrideOf(value: unknown): {
  disabledTools?: string[];
  exposure?: Record<string, 'direct' | 'deferred'>;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const obj = value as Record<string, unknown>;
  const disabledTools = Array.isArray(obj.disabledTools)
    ? obj.disabledTools.filter((item): item is string => typeof item === 'string')
    : undefined;
  const exposureRaw = obj.exposure;
  const exposure: Record<string, 'direct' | 'deferred'> = {};
  if (exposureRaw && typeof exposureRaw === 'object' && !Array.isArray(exposureRaw)) {
    for (const [key, entry] of Object.entries(exposureRaw)) {
      if (entry === 'direct' || entry === 'deferred') {
        exposure[key] = entry;
      }
    }
  }
  return {
    ...(disabledTools !== undefined ? { disabledTools } : {}),
    ...(Object.keys(exposure).length > 0 ? { exposure } : {}),
  };
}

function permissionsOf(config: Record<string, unknown>): PermissionMap | undefined {
  const raw = config.permissionsJson ?? config.permissions;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const out: PermissionMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === 'allow' || value === 'ask' || value === 'deny') {
      out[key] = value;
    }
  }
  return out;
}

function mapPluginComponent(component: {
  kind: string;
  spec: unknown;
}): { item: string; kind: 'skill' | 'mcp' | 'hook' } | undefined {
  if (component.kind === 'skill') {
    const name = (component.spec as { name?: string } | null)?.name;
    return name ? { item: name, kind: 'skill' } : undefined;
  }
  if (component.kind === 'hook') {
    const binding = (
      component.spec as {
        binding?: { event?: string; id?: string };
      } | null
    )?.binding;
    const item = binding?.id ?? binding?.event;
    return item ? { item, kind: 'hook' } : undefined;
  }
  if (component.kind === 'mcp-server') {
    const serverId = (component.spec as { serverId?: string } | null)?.serverId;
    return serverId ? { item: serverId, kind: 'mcp' } : undefined;
  }
  return undefined;
}
