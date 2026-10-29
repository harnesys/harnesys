import { ForbiddenException, Injectable } from '@harnesys/brix';
import type { OrgAuditPage } from '../../domain/fleet/org-audit.port.ts';
import { OrgAudit } from '../../domain/fleet/org-audit.port.ts';
import { authorize } from '../../domain/identity/authorize.ts';
import { type Principal } from '../../domain/identity/principal.ts';

export const AUDIT_READ_CAPABILITY = 'member.read';
export const AUDIT_DEFAULT_LIMIT = 50;
export const AUDIT_MAX_LIMIT = 200;

export interface ListOrgAuditInput {
  principal: Principal;
  orgId: string;
  limit: number;
  offset: number;
}

@Injectable()
export class ListOrgAuditUseCase {
  constructor(private readonly audit: OrgAudit) {}

  execute(input: ListOrgAuditInput): OrgAuditPage {
    if (!authorize(input.principal, AUDIT_READ_CAPABILITY, { orgId: input.orgId })) {
      throw new ForbiddenException(`${AUDIT_READ_CAPABILITY} capability is required`);
    }
    const limit = Math.min(Math.max(1, input.limit), AUDIT_MAX_LIMIT);
    const offset = Math.max(0, input.offset);
    return this.audit.list(input.orgId, limit, offset);
  }
}
