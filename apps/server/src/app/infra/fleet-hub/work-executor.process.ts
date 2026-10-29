import type { TaskEnvelope } from '@harnesys/contracts';
import { type ProcessJobTarget } from 'harnesys';
import { resolveProcessTarget, type ThreadBinding } from '../runtime/workspace-target.ts';
import type { WorkExecutorDeps } from './work-executor.compose.ts';

export async function ensurePlacedProcess(args: {
  deps: WorkExecutorDeps;
  orgId: string;
  envelope: TaskEnvelope;
  prepared: { agentId: string; paths: { cwd: string; threadDir: string } };
}): Promise<ProcessJobTarget | undefined> {
  const { deps, orgId, envelope, prepared } = args;
  if (!envelope.isolation) {
    return undefined;
  }
  const binding: ThreadBinding = {
    sourceId: envelope.sourceId,
    ...(envelope.directory ? { directory: envelope.directory } : {}),
    ...(envelope.worktreeId ? { worktreeId: envelope.worktreeId } : {}),
    isolation: envelope.isolation,
  };
  return resolveProcessTarget(
    { orgId, layout: deps.layout, machineConfig: deps.machineConfig, containers: deps.containers },
    binding,
    prepared,
  );
}
