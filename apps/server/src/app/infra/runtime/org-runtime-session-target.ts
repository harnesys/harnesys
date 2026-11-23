import { resolveRunEnvironment } from '../../application/threads/resolve-run-environment.ts';
import type { OrgRuntimeDeps } from './org-runtime.types.ts';
import { prepareTarget, type TargetCache } from './prepare-org-target.ts';

export function prepareSessionTarget(
  deps: OrgRuntimeDeps,
  threadId: string,
  agentId: string,
  targetCache: TargetCache,
) {
  if (deps.worktrees === undefined) {
    return prepareTarget(deps, threadId, agentId, targetCache);
  }
  try {
    const environment = resolveRunEnvironment(
      {
        orgId: deps.orgId,
        threads: deps.threads,
        agents: deps.agents,
        sources: deps.sources,
        worktrees: deps.worktrees,
        layout: deps.layout,
        localHostId: deps.machineConfig.get().id,
      },
      { threadId, agentId, issue: false },
    );
    return prepareTarget(deps, threadId, agentId, targetCache, { environment });
  } catch {
    return prepareTarget(deps, threadId, agentId, targetCache);
  }
}
