import { EntityNotFoundException } from '@harnesys/brix';

export class FileRuleNotFoundException extends EntityNotFoundException {
  constructor(ruleId: string) {
    super(`File rule not found: ${ruleId}`, { ruleId });
  }
}
