import { Injectable } from '@harnesys/brix';
import { IdentityAudit, type IdentityAuditRow } from '../../domain/identity/identity-audit.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { identityAudit } from './identity.schema.ts';
import { openIdentitySqlite } from './identity-sqlite-session.ts';

@Injectable()
export class IdentityAuditAdapter extends IdentityAudit {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  append(row: IdentityAuditRow): void {
    const sqlite = openIdentitySqlite(this.layout);
    try {
      sqlite.db
        .insert(identityAudit)
        .values({
          id: row.id,
          at: row.at,
          actorKind: row.actorKind,
          actorId: row.actorId,
          action: row.action,
          result: row.result,
          reason: row.reason,
        })
        .run();
    } finally {
      sqlite.sqlite.close();
    }
  }
}
