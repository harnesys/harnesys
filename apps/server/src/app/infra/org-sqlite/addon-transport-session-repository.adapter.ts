import { Injectable } from '@harnesys/brix';
import { AddonTransportSessionRepositoryPort } from '../../domain/addons/ports/transport-session-repository.port.ts';
import type {
  TransportSessionPatch,
  TransportSessionRow,
} from '../../domain/addons/transport-session.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { AddonTransportSessionStore } from './addon-transport-session.store.ts';
import { openOrgSqlite } from './org-sqlite-session.ts';

@Injectable()
export class AddonTransportSessionRepositoryAdapter extends AddonTransportSessionRepositoryPort {
  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly orgs: OrgMachineStore,
  ) {
    super();
  }

  override find(
    orgId: string,
    threadId: string,
    runId: string,
    addonId: string,
  ): TransportSessionRow | null {
    return this.withStore(orgId, (store) => store.find(orgId, threadId, runId, addonId));
  }

  override findParked(
    orgId: string,
    addonId: string,
    externalChatId: string,
  ): TransportSessionRow | null {
    return this.withStore(orgId, (store) => store.findParked(orgId, addonId, externalChatId));
  }

  override open(row: TransportSessionRow): void {
    this.withStore(row.orgId, (store) => store.open(row));
  }

  override listOpen(): TransportSessionRow[] {
    const rows: TransportSessionRow[] = [];
    for (const entry of this.orgs.list()) {
      rows.push(...this.withStore(entry.orgId, (store) => store.listOpen()));
    }
    return rows;
  }

  override patch(
    orgId: string,
    threadId: string,
    runId: string,
    addonId: string,
    patch: TransportSessionPatch,
  ): void {
    this.withStore(orgId, (store) => store.patch(orgId, threadId, runId, addonId, patch));
  }

  override removeAddon(orgId: string, addonId: string): void {
    this.withStore(orgId, (store) => store.removeAddon(orgId, addonId));
  }

  override rememberOutbound(orgId: string, addonId: string, messageId: string): void {
    this.withStore(orgId, (store) => store.rememberOutbound(orgId, addonId, messageId));
  }

  override isOutbound(orgId: string, addonId: string, messageId: string): boolean {
    return this.withStore(orgId, (store) => store.isOutbound(orgId, addonId, messageId));
  }

  private withStore<T>(orgId: string, fn: (store: AddonTransportSessionStore) => T): T {
    const session = openOrgSqlite(this.layout, orgId);
    try {
      return fn(new AddonTransportSessionStore(session.sqlite));
    } finally {
      session.close();
    }
  }
}
