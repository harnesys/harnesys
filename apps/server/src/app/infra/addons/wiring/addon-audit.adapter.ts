import { Injectable } from '@harnesys/brix';
import type { AddonAuditEntry } from '../../../domain/addons/ports/audit.port.ts';
import { AddonAuditPort } from '../../../domain/addons/ports/audit.port.ts';
import type { OrgAuditRow } from '../../../domain/fleet/org-audit.port.ts';
import { OrgAudit } from '../../../domain/fleet/org-audit.port.ts';

@Injectable()
export class OrgAuditAddonAdapter extends AddonAuditPort {
  constructor(private readonly audit: OrgAudit) {
    super();
  }

  override append(orgId: string, entry: AddonAuditEntry): void {
    const row: OrgAuditRow = {
      id: crypto.randomUUID(),
      at: entry.at ?? new Date().toISOString(),
      actorKind: entry.actor.kind,
      actorId: entry.actor.id,
      viaNodeId: null,
      action: entry.action,
      resource: entry.target,
      result: entry.outcome,
    };
    this.audit.append(orgId, row);
  }
}
