import { Injectable } from '@harnesys/brix';
import { eq } from 'drizzle-orm';
import { mintOpaqueToken } from '../../application/identity/mint-token.ts';
import { TicketKeyStore } from '../../domain/identity/ticket-key-store.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from './org-sqlite-session.ts';
import { orgTicketKeysTable } from './schema/index.ts';

@Injectable()
export class TicketKeyStoreAdapter extends TicketKeyStore {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  get(orgId: string): string | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(orgTicketKeysTable)
        .where(eq(orgTicketKeysTable.orgId, orgId))
        .get();
      return row?.key ?? null;
    });
  }

  ensure(orgId: string): string {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const existing = db
        .select()
        .from(orgTicketKeysTable)
        .where(eq(orgTicketKeysTable.orgId, orgId))
        .get();
      if (existing) {
        return existing.key;
      }
      const key = mintOpaqueToken();
      db.insert(orgTicketKeysTable)
        .values({ orgId, key, createdAt: new Date().toISOString() })
        .run();
      return key;
    });
  }

  rotate(orgId: string): string {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const now = new Date().toISOString();
      const key = mintOpaqueToken();
      db.insert(orgTicketKeysTable)
        .values({ orgId, key, createdAt: now })
        .onConflictDoUpdate({
          target: orgTicketKeysTable.orgId,
          set: { key, rotatedAt: now },
        })
        .run();
      return key;
    });
  }
}
