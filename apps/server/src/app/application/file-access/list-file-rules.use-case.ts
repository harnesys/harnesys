import { Injectable } from '@harnesys/brix';
import type { ListFileRulesResponse } from '@harnesys/contracts';
import { FileAccessRulePort } from '../../domain/file-access/file-access-rule.port.ts';
import { toFileRulePublic } from './file-rule.helpers.ts';

export interface ListFileRulesRequest {
  orgId: string;
}

@Injectable()
export class ListFileRulesUseCase {
  constructor(private readonly rules: FileAccessRulePort) {}

  execute(request: ListFileRulesRequest): ListFileRulesResponse {
    return { items: this.rules.list(request.orgId).map(toFileRulePublic) };
  }
}
