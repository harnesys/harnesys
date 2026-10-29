import type { AgentSourceLevel } from '@harnesys/contracts';
import type { FileAccessPolicy, FileRuleInput } from 'harnesys';
import type { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import {
  derivedFileRules,
  type SharedSourceAccess,
} from '../../domain/file-access/derived-file-rules.ts';
import {
  createFileAccessPolicy,
  fileRuleInputsOf,
} from '../../domain/file-access/file-access-policy.factory.ts';
import type { FileAccessRulePort } from '../../domain/file-access/file-access-rule.port.ts';
import type { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import type { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';

interface FileAccessRuntimeDeps {
  orgId: string;
  fileRules: FileAccessRulePort;
  sources: SourceRegistryPort;
  sourceLocation: SourceLocationPort;
}

interface FileAccessAgentDeps {
  agents?: Pick<AgentRegistryPort, 'findById'>;
}

interface PreparedTargetRef {
  agent: {
    id: string;
    sharedSourceIds: string[];
    sourceLevels: Record<string, AgentSourceLevel>;
  };
  paths: { threadDir: string };
  runtime: { hostId: string; primaryDirectory: string };
}

export function runTargetFileAccess(
  deps: FileAccessRuntimeDeps,
  prepared: PreparedTargetRef,
): FileAccessPolicy {
  const declared = fileRuleInputsOf(deps.fileRules.listForAgent(deps.orgId, prepared.agent.id));
  return createFileAccessPolicy({
    rules: [...declared, ...derivedRulesOf(deps, prepared)],
    hostId: prepared.runtime.hostId,
    agentId: prepared.agent.id,
    primaryDirectory: prepared.runtime.primaryDirectory,
  });
}

export function runTargetFileAccessForAgent(
  deps: FileAccessRuntimeDeps & FileAccessAgentDeps,
  prepared: PreparedTargetRef,
  agentId: string,
): FileAccessPolicy {
  const record = deps.agents?.findById(deps.orgId, agentId);
  if (record === undefined) {
    return runTargetFileAccess(deps, prepared);
  }
  return runTargetFileAccess(deps, {
    agent: {
      id: record.id,
      sharedSourceIds: record.sharedSourceIds,
      sourceLevels: record.sourceLevels,
    },
    paths: prepared.paths,
    runtime: prepared.runtime,
  });
}

function derivedRulesOf(deps: FileAccessRuntimeDeps, prepared: PreparedTargetRef): FileRuleInput[] {
  return derivedFileRules({
    workspaceRoot: resolveRoot(deps, workspaceSourceIdOf(deps), prepared.runtime.hostId),
    sharedSources: sharedSourceAccessOf(deps, prepared),
    threadDir: prepared.paths.threadDir,
    agentId: prepared.agent.id,
    hostId: prepared.runtime.hostId,
  });
}

function sharedSourceAccessOf(
  deps: FileAccessRuntimeDeps,
  prepared: PreparedTargetRef,
): SharedSourceAccess[] {
  const out: SharedSourceAccess[] = [];
  for (const sourceId of prepared.agent.sharedSourceIds) {
    const root = resolveRoot(deps, sourceId, prepared.runtime.hostId);
    if (root === null) {
      continue;
    }
    out.push({
      sourceId,
      root,
      level: prepared.agent.sourceLevels[sourceId] ?? 'edit',
    });
  }
  return out;
}

function workspaceSourceIdOf(deps: FileAccessRuntimeDeps): string | null {
  return deps.sources.findManagedWorkspace(deps.orgId)?.id ?? null;
}

function resolveRoot(
  deps: FileAccessRuntimeDeps,
  sourceId: string | null,
  hostId: string,
): string | null {
  if (sourceId === null) {
    return null;
  }
  try {
    return deps.sourceLocation.resolve({ orgId: deps.orgId, sourceId, hostId }).absoluteRoot;
  } catch {
    return null;
  }
}
