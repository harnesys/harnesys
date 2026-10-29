import { Injectable } from '@harnesys/brix';
import type { HookRun } from '@harnesys/contracts';
import { type HookRunInput, HookRunStorePort } from '../../domain/agent/hook-run-store.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { HookRunStore } from './hook-run.store.ts';
import { withOrgSqlite } from './org-sqlite-session.ts';

@Injectable()
export class HookRunAdapter extends HookRunStorePort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  record(orgId: string, input: HookRunInput): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      new HookRunStore(db).record(orgId, input);
    });
  }

  list(orgId: string, agentId: string, limit: number): HookRun[] {
    return withOrgSqlite(this.layout, orgId, (db) => {
      return new HookRunStore(db).list(agentId, limit);
    });
  }
}
