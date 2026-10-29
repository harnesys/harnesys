import { Controller, Get, Param, Query } from '@harnesys/brix';
import { ListOrgAuditUseCase } from '../../application/identity/list-org-audit.use-case.ts';
import type { OrgAuditPage } from '../../domain/fleet/org-audit.port.ts';
import { type Principal } from '../../domain/identity/principal.ts';
import { SessionPrincipal } from '../guards/session.guard.ts';
import { type OrgAuditQuery, OrgAuditQuerySchema } from './audit.schema.ts';

@Controller('orgs/:orgId/audit')
export class AuditController {
  constructor(private readonly auditList: ListOrgAuditUseCase) {}

  @Get()
  list(
    @Param('orgId') orgId: string,
    @SessionPrincipal() principal: Principal,
    @Query(OrgAuditQuerySchema) query: OrgAuditQuery,
  ): OrgAuditPage {
    return this.auditList.execute({
      principal,
      orgId,
      limit: query.limit,
      offset: query.offset,
    });
  }
}
