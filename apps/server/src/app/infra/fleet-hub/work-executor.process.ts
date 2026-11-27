import type { RunEnvironment, TaskEnvelope } from '@harnesys/contracts';
import { type ProcessJobTarget } from 'harnesys';
import { resolveProcessTarget } from '../runtime/workspace-target.ts';
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
  return resolveProcessTarget(
    { orgId, layout: deps.layout, machineConfig: deps.machineConfig, containers: deps.containers },
    environmentOf(envelope),
    prepared,
    envelope.isolation,
  );
}

function environmentOf(envelope: TaskEnvelope): RunEnvironment | undefined {
  if (envelope.environment !== undefined) {
    return envelope.environment;
  }
  if (envelope.directory !== undefined) {
    return {
      anchor: { kind: 'folder', path: envelope.directory },
      cwd: 'anchor',
      provenance: 'run',
    };
  }
  if (envelope.sourceId === undefined) {
    return undefined;
  }
  return {
    anchor: {
      kind: 'source',
      sourceId: envelope.sourceId,
      ...(envelope.worktreeId !== undefined ? { worktreeId: envelope.worktreeId } : {}),
    },
    cwd: envelope.isolation?.mode === 'container' ? 'thread' : 'anchor',
    provenance: 'run',
  };
}
