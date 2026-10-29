import type { FileRuleInsert, FileRuleRecord } from './file-access-rule.ts';

export abstract class FileAccessRulePort {
  abstract list(orgId: string): FileRuleRecord[];
  abstract listForAgent(orgId: string, agentId: string): FileRuleRecord[];
  abstract insert(rule: FileRuleInsert): FileRuleRecord;
  abstract remove(orgId: string, ruleId: string): void;
}
