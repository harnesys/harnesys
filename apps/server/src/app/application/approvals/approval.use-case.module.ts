import { Module } from '@harnesys/brix';
import { ApprovalEventsPort } from '../../domain/approval/approval-events.port.ts';
import { CreatePermissionRuleUseCase } from './create-permission-rule.use-case.ts';
import { DecideApprovalUseCase } from './decide-approval.use-case.ts';
import { GetApprovalUseCase } from './get-approval.use-case.ts';
import { ListApprovalsUseCase } from './list-approvals.use-case.ts';
import { ListPermissionRulesUseCase } from './list-permission-rules.use-case.ts';
import { RequestApprovalUseCase } from './request-approval.use-case.ts';
import { RevokePermissionRuleUseCase } from './revoke-permission-rule.use-case.ts';

const useCases = [
  RequestApprovalUseCase,
  ListApprovalsUseCase,
  GetApprovalUseCase,
  DecideApprovalUseCase,
  ListPermissionRulesUseCase,
  CreatePermissionRuleUseCase,
  RevokePermissionRuleUseCase,
];

@Module({
  providers: [...useCases],
  exports: [...useCases, ApprovalEventsPort],
})
export class ApprovalUseCaseModule {}
