import { Injectable } from '@harnesys/brix';
import type {
  WorkerLeaseClaim,
  WorkerLeaseRelease,
  WorkerLeaseState,
} from '../../domain/addons/ports/worker-lease.port.ts';
import { AddonWorkerLeasePort } from '../../domain/addons/ports/worker-lease.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { AddonWorkerLeaseStore } from './addon-worker-lease.store.ts';
import { openOrgSqlite } from './org-sqlite-session.ts';

@Injectable()
export class AddonWorkerLeaseAdapter extends AddonWorkerLeasePort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  override claim(input: WorkerLeaseClaim): WorkerLeaseState {
    return this.withStore(input.orgId, (store) => store.claim(input));
  }

  override release(input: WorkerLeaseRelease): boolean {
    return this.withStore(input.orgId, (store) => store.release(input));
  }

  private withStore<T>(orgId: string, fn: (store: AddonWorkerLeaseStore) => T): T {
    const session = openOrgSqlite(this.layout, orgId);
    try {
      return fn(new AddonWorkerLeaseStore(session.sqlite));
    } finally {
      session.close();
    }
  }
}
