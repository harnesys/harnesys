import type {
  AgentDefinition,
  HookBinding,
  HookRunReport,
  RunEventFeed,
  RunEventStore,
} from 'harnesys';
import { createHookReport } from './hook-report.ts';
import { resolveHookSecrets } from './hook-secrets.ts';
import type { OrgPluginWiring } from './org-plugin-wiring.ts';
import type { OrgRuntimeDeps } from './org-runtime.types.ts';

export async function resolveTargetHooks(input: {
  deps: OrgRuntimeDeps;
  plugin: OrgPluginWiring;
  agentDef: AgentDefinition;
  cwd: string;
}): Promise<HookBinding[]> {
  return await resolveHookSecrets(
    input.plugin.view.hooksFor(input.agentDef, input.cwd),
    input.deps.secrets,
    input.deps.orgId,
  );
}

export function targetHookReport(input: {
  deps: OrgRuntimeDeps;
  events: RunEventStore;
  feed: RunEventFeed;
}): { hookReport?: (report: HookRunReport) => void } {
  if (input.deps.hookRuns === undefined) {
    return {};
  }
  return {
    hookReport: createHookReport({
      orgId: input.deps.orgId,
      hookRuns: input.deps.hookRuns,
      events: input.events,
      feed: input.feed,
    }),
  };
}
