import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { PackRegistration } from '../domain/pack.ts';
import type { Logger } from '../ports/logger.ts';
import type { PermissionMap } from '../ports/permissions.ts';
import type { SkillRegistry } from '../ports/skills.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import type { ExplainEntry } from './capability-explain.ts';
import type { CapabilityUniverse, RunRegistry } from './capability-set.ts';
import { resolveCapabilitySet } from './capability-set.ts';
import type { PackRunMap } from './packs/pack-run.ts';
import { effectiveSkillRegistry } from './packs/pack-run.ts';
import { createLoadSkillTool } from './skills/create-load-skill-tool.ts';
import { createLoadToolsTool } from './tools/create-load-tools-tool.ts';
import { aliasTool } from './tools/tool-alias.ts';
export interface AgentIdentity {
  toolRegistry: Map<string, ToolDefinition>;
  packOutputs: PackRunMap;
  explain: ExplainEntry[];
}
export interface ResolveAgentIdentityCtx {
  baseRegistry: Map<string, ToolDefinition>;
  registrations: PackRegistration[];
  fsSkills?: SkillRegistry;
  permissions?: PermissionMap;
  logger?: Logger;
}
export function resolveAgentIdentity(
  def: AgentDefinition,
  ctx: ResolveAgentIdentityCtx,
): AgentIdentity {
  const universe: CapabilityUniverse = {
    registrations: ctx.registrations,
    baseRegistry: ctx.baseRegistry,
    roster: [],
    fsSkills: ctx.fsSkills,
    makeLoadTools: (registry: RunRegistry) => createLoadToolsTool(flatRegistry(registry)),
    ...(ctx.permissions !== undefined ? { permissions: ctx.permissions } : {}),
  };
  const fsSkills = ctx.fsSkills;
  universe.makeLoadSkill = (packOutputs) => {
    const loadSkill = createLoadSkillTool(effectiveSkillRegistry(def, fsSkills, packOutputs), {
      ...(fsSkills === undefined ? {} : { installed: fsSkills }),
    });
    return [loadSkill, aliasTool(loadSkill, 'Skill')];
  };
  const set = resolveCapabilitySet(def, universe);
  if (set.fatal.length > 0) {
    ctx.logger?.warn(`[capabilities] ${set.fatal.join('; ')}`);
  }
  return {
    toolRegistry: flatRegistry(set.registry),
    packOutputs: set.packOutputs,
    explain: set.explain,
  };
}
function flatRegistry(registry: RunRegistry): Map<string, ToolDefinition> {
  return new Map(
    [...registry].map(([name, entry]) => [name, { ...entry.def, exposure: entry.exposure }]),
  );
}
