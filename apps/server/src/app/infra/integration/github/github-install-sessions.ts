import { Injectable } from '@harnesys/brix';
import { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import { OrgMachineStore } from '../../../domain/machine/org-machine-store.port.ts';
import {
  deleteIntegrationSession,
  findPendingIntegrationSessionByState,
  getIntegrationSessionById,
  type IntegrationSessionRow,
  purgeExpiredIntegrationSessions,
  upsertIntegrationSession,
} from '../../org-sqlite/org-sql-integration-sessions.ts';
import { withOrgSqlite } from '../../org-sqlite/org-sqlite-session.ts';

export const GITHUB_INSTALL_SESSION_TTL_MS = 10 * 60_000;
const PROVIDER = 'github';
const KIND = 'github-install';

export type GithubInstallSessionState =
  | { status: 'pending'; orgId: string; state: string; expiresAt: number }
  | { status: 'ready'; orgId: string; integrationId: string }
  | { status: 'denied'; orgId: string }
  | { status: 'expired'; orgId: string };

@Injectable()
export class GithubInstallSessionStore {
  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly orgs: OrgMachineStore,
  ) {}

  create(orgId: string, state: string, sessionId: string = crypto.randomUUID()): string {
    const expiresAt = Date.now() + GITHUB_INSTALL_SESSION_TTL_MS;
    withOrgSqlite(this.layout, orgId, (db) => {
      purgeExpiredIntegrationSessions((sql) => db.run(sql), PROVIDER, Date.now());
      upsertIntegrationSession((sql) => db.run(sql), {
        id: sessionId,
        orgId,
        provider: PROVIDER,
        kind: KIND,
        state,
        status: 'pending',
        payloadJson: '{}',
        createdAt: new Date().toISOString(),
        expiresAt,
      });
    });
    return sessionId;
  }

  findByState(
    state: string,
  ): { sessionId: string; session: { orgId: string; expiresAt: number } } | null {
    for (const org of this.orgs.list()) {
      const row = withOrgSqlite(this.layout, org.orgId, (db) =>
        findPendingIntegrationSessionByState(
          (sql) => db.all(sql) as Array<Record<string, unknown>>,
          PROVIDER,
          KIND,
          state,
        ),
      );
      if (row) {
        return { sessionId: row.id, session: { orgId: row.orgId, expiresAt: row.expiresAt ?? 0 } };
      }
    }
    return null;
  }

  get(sessionId: string): GithubInstallSessionState | null {
    const row = this.findRow(sessionId);
    return row ? installStateFromRow(row) : null;
  }

  set(sessionId: string, state: GithubInstallSessionState): void {
    const row = this.findRow(sessionId);
    if (!row) {
      return;
    }
    withOrgSqlite(this.layout, row.orgId, (db) => {
      upsertIntegrationSession((sql) => db.run(sql), {
        id: sessionId,
        orgId: row.orgId,
        provider: PROVIDER,
        kind: KIND,
        state: state.status === 'pending' ? state.state : null,
        status: state.status,
        payloadJson: JSON.stringify(state),
        createdAt: row.createdAt,
        expiresAt: state.status === 'pending' ? state.expiresAt : null,
      });
    });
  }

  delete(sessionId: string): void {
    const row = this.findRow(sessionId);
    if (!row) {
      return;
    }
    withOrgSqlite(this.layout, row.orgId, (db) => {
      deleteIntegrationSession((sql) => db.run(sql), sessionId);
    });
  }

  private findRow(sessionId: string): IntegrationSessionRow | null {
    for (const org of this.orgs.list()) {
      const row = withOrgSqlite(this.layout, org.orgId, (db) =>
        getIntegrationSessionById(
          (sql) => db.all(sql) as Array<Record<string, unknown>>,
          sessionId,
        ),
      );
      if (row) {
        return row;
      }
    }
    return null;
  }
}

function installStateFromRow(row: IntegrationSessionRow): GithubInstallSessionState | null {
  const parsed: unknown = JSON.parse(row.payloadJson);
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const payload = parsed as Record<string, unknown>;
  switch (row.status) {
    case 'pending':
      return {
        status: 'pending',
        orgId: row.orgId,
        state: row.state ?? '',
        expiresAt: row.expiresAt ?? 0,
      };
    case 'ready':
      return typeof payload.integrationId === 'string'
        ? { status: 'ready', orgId: row.orgId, integrationId: payload.integrationId }
        : null;
    case 'denied':
      return { status: 'denied', orgId: row.orgId };
    case 'expired':
      return { status: 'expired', orgId: row.orgId };
    default:
      return null;
  }
}
