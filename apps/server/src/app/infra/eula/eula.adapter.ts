import { Injectable } from '@harnesys/brix';
import type { EulaConsent } from '@harnesys/contracts';
import { eq } from 'drizzle-orm';
import { EulaPort } from '../../domain/eula/eula.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withMachineSqlite } from '../plugins/machine-sqlite-session.ts';
import { eulaConsentsTable } from './eula.schema.ts';

@Injectable()
export class EulaAdapter extends EulaPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  getConsent(agreementId: string): EulaConsent | null {
    return withMachineSqlite(this.layout, (db) => {
      const row = db
        .select()
        .from(eulaConsentsTable)
        .where(eq(eulaConsentsTable.id, agreementId))
        .get();
      return row ? { agreementId: row.id, acceptedAt: row.acceptedAt } : null;
    });
  }

  recordConsent(consent: EulaConsent): EulaConsent {
    return withMachineSqlite(this.layout, (db) => {
      db.insert(eulaConsentsTable)
        .values({ id: consent.agreementId, acceptedAt: consent.acceptedAt })
        .onConflictDoUpdate({
          target: eulaConsentsTable.id,
          set: { acceptedAt: consent.acceptedAt },
        })
        .run();
      return consent;
    });
  }
}
