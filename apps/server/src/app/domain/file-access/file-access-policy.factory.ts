import type { FileAccessPolicy, FileRuleInput } from 'harnesys';
import { resolveFileAccess } from 'harnesys';
import type { FileRuleRecord } from './file-access-rule.ts';

export interface CreateFileAccessPolicyInput {
  rules: FileRuleInput[];
  hostId: string;
  agentId: string;
  primaryDirectory: string;
}

export function createFileAccessPolicy(input: CreateFileAccessPolicyInput): FileAccessPolicy {
  const rules = [...input.rules];
  return (request) =>
    resolveFileAccess({
      canonicalPath: request.path,
      action: request.action,
      primaryDirectory: input.primaryDirectory,
      hostId: input.hostId,
      agentId: input.agentId,
      rules,
    });
}

export function fileRuleInputsOf(records: FileRuleRecord[]): FileRuleInput[] {
  return records.map((record) => ({
    agentId: record.agentId,
    hostId: record.hostId,
    pathPattern: record.pathPattern,
    action: record.action,
    effect: record.effect,
  }));
}
