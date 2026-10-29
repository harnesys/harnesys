import type {
  AgentPresetBody,
  CatalogItem,
  PresetDetail,
  PresetKind,
  PresetOrigin,
} from '@harnesys/contracts';
import type { Agent } from '@/entities/agent';

export const PRESET_KIND_COLORS: Record<PresetKind, string> = {
  agent: '#6366f1',
  team: '#0ea5e9',
};

export const PRESET_ORIGIN_COLORS: Record<PresetOrigin, string> = {
  system: '#10b981',
  user: '#6366f1',
  registry: '#a855f7',
};

export function presetOriginLabel(origin: PresetOrigin): string {
  if (origin === 'system') {
    return 'System';
  }
  if (origin === 'user') {
    return 'Mine';
  }
  return 'Registry';
}

export function presetSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'preset';
}

export function localPresetId(name: string): string {
  return `local/${presetSlug(name)}`;
}

export function catalogRoleLabel(item: CatalogItem): string {
  if (item.kind === 'agent') {
    return item.role;
  }
  return item.roles.map((role) => role.name).join(', ');
}

export function catalogSearchText(item: CatalogItem): string {
  const parts = [item.name, item.description ?? '', item.tags.join(' '), catalogRoleLabel(item)];
  return parts.join(' ').toLowerCase();
}

export function presetExcerpt(body: AgentPresetBody): string {
  const line = body.instructions
    .split('\n')
    .map((entry) => entry.replace(/^#+\s*/, '').trim())
    .find((entry) => entry !== '' && !entry.toLowerCase().startsWith(body.name.toLowerCase()));
  return line ?? body.role;
}

export function presetCapabilityNames(body: AgentPresetBody): string[] {
  return Object.keys(body.capabilities ?? {});
}

export function presetGraphSummary(body: AgentPresetBody): string {
  const nodes = Object.keys(body.graph?.nodes ?? {}).length;
  const edges = body.graph?.edges.length ?? 0;
  return `${nodes} nodes · ${edges} edges`;
}

export function agentPresetBodyFromAgent(agent: Agent): AgentPresetBody {
  return {
    name: agent.name,
    role: agent.role || 'agent',
    instructions: agent.instructions,
    ...(agent.skills.length > 0 ? { skills: agent.skills } : {}),
    ...(agent.mcpServers.length > 0 ? { mcpServers: agent.mcpServers } : {}),
    ...(agent.budget ? { budget: agent.budget } : {}),
    ...(Object.keys(agent.capabilities ?? {}).length > 0
      ? { capabilities: agent.capabilities as Record<string, Record<string, unknown> | null> }
      : {}),
    ...(agent.permissions
      ? { permissions: agent.permissions as Record<string, 'allow' | 'ask' | 'deny'> }
      : {}),
    ...(agent.graph ? { graph: agent.graph } : {}),
  };
}

export function roleKeyForAgent(agent: Agent): string {
  return presetSlug(agent.role || agent.name);
}

export function isUserPreset(detail: PresetDetail): boolean {
  return detail.origin === 'user';
}

export function detailOwnerName(detail: PresetDetail): string {
  return detail.id.split('/')[0] ?? 'local';
}
