import { Injectable } from '@harnesys/brix';
import { FileAccessRulePort } from '../../domain/file-access/file-access-rule.port.ts';

export interface DeleteFileRuleRequest {
  orgId: string;
  ruleId: string;
}

@Injectable()
export class DeleteFileRuleUseCase {
  constructor(private readonly rules: FileAccessRulePort) {}

  execute(request: DeleteFileRuleRequest): void {
    this.rules.remove(request.orgId, request.ruleId);
  }
}
