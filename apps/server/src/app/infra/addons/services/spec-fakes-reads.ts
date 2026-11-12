import { GetEffectiveSkillsUseCase } from '../../../application/skills/get-effective-skills.use-case.ts';
import { ListOrgSkillsUseCase } from '../../../application/skills/list-org-skills.use-case.ts';
import { CompactThreadUseCase } from '../../../application/threads/compact-thread.use-case.ts';
import { ListThreadRunsUseCase } from '../../../application/threads/list-thread-runs.use-case.ts';
import type { CompactThreadResult } from '../../../domain/thread/local-executor.port.ts';
import type { RunSummaryRecord } from '../../../domain/thread/run-lifecycle-reader.port.ts';
import type { UsageSummary } from '../../../domain/usage/usage-port.ts';
import { UsagePort } from '../../../domain/usage/usage-port.ts';

export function stubListThreadRuns(
  rows: RunSummaryRecord[] = [],
  error: Error | null = null,
): ListThreadRunsUseCase & { requests: Array<Record<string, unknown>> } {
  const requests: Array<Record<string, unknown>> = [];
  const stub = {
    requests,
    execute: (request: { orgId: string; threadId: string; status?: string }) => {
      requests.push(request as Record<string, unknown>);
      if (error) {
        return Promise.reject(error);
      }
      return Promise.resolve(
        rows.filter((row) => request.status === undefined || row.status === request.status),
      );
    },
  };
  return Object.assign(Object.create(ListThreadRunsUseCase.prototype), stub);
}

export function stubCompact(
  result: CompactThreadResult = { compacted: false },
): CompactThreadUseCase & { requests: Array<Record<string, unknown>> } {
  const requests: Array<Record<string, unknown>> = [];
  const stub = {
    requests,
    execute: (request: { orgId: string; threadId: string }) => {
      requests.push(request as Record<string, unknown>);
      return Promise.resolve(result);
    },
  };
  return Object.assign(Object.create(CompactThreadUseCase.prototype), stub);
}

export function stubUsage(
  result: UsageSummary = { inputTokens: 0, outputTokens: 0, costUsd: 0, byModel: [] },
): UsagePort & { requests: Array<Record<string, unknown>> } {
  const requests: Array<Record<string, unknown>> = [];
  const stub = {
    requests,
    summary: (orgId: string, request: { threadId?: string; since?: string }) => {
      requests.push({ orgId, ...request });
      return result;
    },
  };
  return Object.assign(Object.create(UsagePort.prototype), stub);
}

export function stubEffectiveSkills(
  skills: Array<{ name: string; description: string; origin: { kind: string } }>,
): GetEffectiveSkillsUseCase & { requests: Array<Record<string, unknown>> } {
  const requests: Array<Record<string, unknown>> = [];
  const stub = {
    requests,
    execute: (request: { orgId: string; agentId: string }) => {
      requests.push(request as Record<string, unknown>);
      return Promise.resolve({ skills: skills.map((skill) => ({ ...skill, granted: true })) });
    },
  };
  return Object.assign(Object.create(GetEffectiveSkillsUseCase.prototype), stub);
}

export function stubOrgSkills(
  skills: Array<{ name: string; description: string; origin: { kind: string } }>,
): ListOrgSkillsUseCase & { requests: Array<Record<string, unknown>> } {
  const requests: Array<Record<string, unknown>> = [];
  const stub = {
    requests,
    execute: (request: { orgId: string }) => {
      requests.push(request as Record<string, unknown>);
      return Promise.resolve({ skills });
    },
  };
  return Object.assign(Object.create(ListOrgSkillsUseCase.prototype), stub);
}
