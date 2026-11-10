import { rmSync } from 'node:fs';
import { Injectable } from '@harnesys/brix';
import type { HostRequestName } from '@harnesys/sdk';
import { AddonDataPort } from '../../../application/addons/addon-data.port.ts';
import { AddonRpcPort } from '../../../application/addons/addon-rpc.port.ts';
import type { AddonNotifyOutcome } from '../../../domain/addons/ports/addon-notify.port.ts';
import { AddonNotifyPort } from '../../../domain/addons/ports/addon-notify.port.ts';
import { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import { AddonInstanceSupervisor } from '../supervisor/instance-supervisor.ts';
import { addonDataDirOf } from './addon-db-access.adapter.ts';
@Injectable()
export class SupervisorNotifyAdapter extends AddonNotifyPort {
  constructor(private readonly supervisor: AddonInstanceSupervisor) {
    super();
  }

  override notify(
    orgId: string,
    addonId: string,
    method: string,
    params: unknown,
  ): AddonNotifyOutcome {
    const outcome = this.supervisor.notify(orgId, addonId, method, params);
    return outcome.delivered ? 'delivered' : 'not_running';
  }
}

@Injectable()
export class SupervisorRpcAdapter extends AddonRpcPort {
  constructor(private readonly supervisor: AddonInstanceSupervisor) {
    super();
  }

  override request(
    orgId: string,
    addonId: string,
    method: HostRequestName,
    params: unknown,
    timeoutMs: number,
    _signal?: AbortSignal,
  ): Promise<unknown> {
    return this.supervisor.request(orgId, addonId, method, params, timeoutMs);
  }
}

@Injectable()
export class AddonDataRemoveAdapter extends AddonDataPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  override removeData(orgId: string, addonId: string): void {
    rmSync(addonDataDirOf(this.layout, orgId, addonId), { recursive: true, force: true });
  }
}

@Injectable()
export class AccountsChangedNotifySink {
  constructor(private readonly notify: AddonNotifyPort) {}

  async accountsChanged(
    orgId: string,
    addonId: string,
    event: { connection: string; accountId: string; status: string },
  ): Promise<void> {
    this.notify.notify(orgId, addonId, 'accounts.changed', {
      connection: event.connection,
      accountId: event.accountId,
      status: event.status,
    });
  }
}
