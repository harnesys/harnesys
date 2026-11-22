import { Injectable } from '@harnesys/brix';
import { eq } from 'drizzle-orm';
import { SignalStorePort } from 'harnesys';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { type OrgSqliteDb, withOrgSqlite } from './org-sqlite-session.ts';
import { signalsTable } from './schema/index.ts';

@Injectable()
export class SignalStoreAdapter extends SignalStorePort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  recordFire(orgId: string, key: string): void {
    withOrgSqlite(this.layout, orgId, (db: OrgSqliteDb) => {
      db.insert(signalsTable)
        .values({ key, firedAt: new Date().toISOString() })
        .onConflictDoUpdate({
          target: signalsTable.key,
          set: { firedAt: new Date().toISOString() },
        })
        .run();
    });
  }

  isFired(orgId: string, key: string): boolean {
    return withOrgSqlite(this.layout, orgId, (db: OrgSqliteDb) => {
      return (
        db.select().from(signalsTable).where(eq(signalsTable.key, key)).limit(1).get() !== undefined
      );
    });
  }
}
