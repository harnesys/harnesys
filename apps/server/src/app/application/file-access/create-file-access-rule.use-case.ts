import { Injectable } from '@harnesys/brix';
import type { CreateFileRuleBody, FileRulePublic } from '@harnesys/contracts';
import { FileAccessRulePort } from '../../domain/file-access/file-access-rule.port.ts';
import { toFileRulePublic } from './file-rule.helpers.ts';

export interface CreateFileAccessRuleRequest {
  orgId: string;
  body: CreateFileRuleBody;
}

@Injectable()
export class CreateFileAccessRuleUseCase {
  constructor(private readonly rules: FileAccessRulePort) {}

  execute(request: CreateFileAccessRuleRequest): FileRulePublic {
    return toFileRulePublic(
      this.rules.insert({
        orgId: request.orgId,
        agentId: request.body.agentId ?? null,
        hostId: request.body.hostId ?? null,
        pathPattern: request.body.pathPattern,
        action: request.body.action,
        effect: request.body.effect,
      }),
    );
  }
}
