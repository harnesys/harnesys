import { Injectable } from '@harnesys/brix';
import type {
  TriggerScriptPendingPost,
  TriggerScriptRunInput,
  TriggerScriptRunRow,
} from '../../domain/addons/ports/trigger-script-run-repository.port.ts';
import { TriggerScriptRunRepositoryPort } from '../../domain/addons/ports/trigger-script-run-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { openOrgSqlite } from './org-sqlite-session.ts';
import { TriggerScriptRunStore } from './trigger-script-run.store.ts';

@Injectable()
export class TriggerScriptRunRepositoryAdapter extends TriggerScriptRunRepositoryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  override record(input: TriggerScriptRunInput): void {
    this.withStore(input.orgId, (store) => store.record(input));
  }

  override list(orgId: string, instanceId: string, limit: number): TriggerScriptRunRow[] {
    return this.withStore(orgId, (store) => store.list(orgId, instanceId, limit));
  }

  override savePending(input: TriggerScriptPendingPost): void {
    this.withStore(input.orgId, (store) => store.savePending(input));
  }

  override takePending(orgId: string, runId: string): TriggerScriptPendingPost | null {
    return this.withStore(orgId, (store) => store.takePending(orgId, runId));
  }

  override removePendingForInstance(orgId: string, instanceId: string): void {
    this.withStore(orgId, (store) => store.removePendingForInstance(orgId, instanceId));
  }

  private withStore<T>(orgId: string, fn: (store: TriggerScriptRunStore) => T): T {
    const session = openOrgSqlite(this.layout, orgId);
    try {
      return fn(new TriggerScriptRunStore(session.sqlite));
    } finally {
      session.close();
    }
  }
}
