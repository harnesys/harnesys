import type { FileRulePublic } from '@harnesys/contracts';
import type { FileRuleRecord } from '../../domain/file-access/file-access-rule.ts';

export function toFileRulePublic(record: FileRuleRecord): FileRulePublic {
  return {
    id: record.id,
    orgId: record.orgId,
    agentId: record.agentId,
    hostId: record.hostId,
    pathPattern: record.pathPattern,
    action: record.action,
    effect: record.effect,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
