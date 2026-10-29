import { Injectable } from '@harnesys/brix';
import { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import { OrgMachineStore } from '../../../domain/machine/org-machine-store.port.ts';
import {
  deleteIntegrationSession,
  getIntegrationSessionById,
  purgeExpiredIntegrationSessions,
  upsertIntegrationSession,
} from '../../org-sqlite/org-sql-integration-sessions.ts';
import { withOrgSqlite } from '../../org-sqlite/org-sqlite-session.ts';

export const GITHUB_MANIFEST_SESSION_TTL_MS = 30 * 60_000;
const PROVIDER = 'github';
const KIND = 'github-manifest';

export interface GithubManifestSession {
  orgId: string;
  origin: string;
  name: string;
  expiresAt: number;
}

@Injectable()
export class GithubManifestSessionStore {
  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly orgs: OrgMachineStore,
  ) {}

  create(orgId: string, origin: string, name: string): string {
    const ticket = crypto.randomUUID();
    withOrgSqlite(this.layout, orgId, (db) => {
      purgeExpiredIntegrationSessions((sql) => db.run(sql), PROVIDER, Date.now());
      upsertIntegrationSession((sql) => db.run(sql), {
        id: ticket,
        orgId,
        provider: PROVIDER,
        kind: KIND,
        state: null,
        status: 'pending',
        payloadJson: JSON.stringify({ origin, name }),
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() + GITHUB_MANIFEST_SESSION_TTL_MS,
      });
    });
    return ticket;
  }

  find(ticket: string): GithubManifestSession | null {
    const session = this.read(ticket);
    if (!session) {
      return null;
    }
    if (Date.now() >= session.expiresAt) {
      this.consume(ticket);
      return null;
    }
    return session;
  }

  consume(ticket: string): GithubManifestSession | null {
    const session = this.read(ticket);
    if (!session) {
      return null;
    }
    this.remove(ticket);
    return session;
  }

  private read(ticket: string): GithubManifestSession | null {
    for (const org of this.orgs.list()) {
      const session = withOrgSqlite(this.layout, org.orgId, (db) => {
        const row = getIntegrationSessionById(
          (sql) => db.all(sql) as Array<Record<string, unknown>>,
          ticket,
        );
        if (!row || row.kind !== KIND) {
          return null;
        }
        return manifestSessionFromRow(row);
      });
      if (session) {
        return session;
      }
    }
    return null;
  }

  private remove(ticket: string): void {
    for (const org of this.orgs.list()) {
      const removed = withOrgSqlite(this.layout, org.orgId, (db) => {
        deleteIntegrationSession((sql) => db.run(sql), ticket);
        return true;
      });
      if (removed) {
        return;
      }
    }
  }
}

function manifestSessionFromRow(row: {
  orgId: string;
  payloadJson: string;
  expiresAt: number | null;
}): GithubManifestSession | null {
  try {
    const payload: unknown = JSON.parse(row.payloadJson);
    if (typeof payload !== 'object' || payload === null) {
      return null;
    }
    const record = payload as Record<string, unknown>;
    if (typeof record.origin !== 'string' || typeof record.name !== 'string') {
      return null;
    }
    return {
      orgId: row.orgId,
      origin: record.origin,
      name: record.name,
      expiresAt: row.expiresAt ?? 0,
    };
  } catch {
    return null;
  }
}
