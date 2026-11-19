import { Injectable, type ModuleDestroyHook } from '@harnesys/brix';
import type { ModelQuotaPort } from 'harnesys';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { ModelQuotaFactoryPort } from '../../domain/model-quota/model-quota-factory.port.ts';
import { SqliteModelQuota } from './sqlite-model-quota.adapter.ts';

@Injectable()
export class SqliteModelQuotaFactory extends ModelQuotaFactoryPort implements ModuleDestroyHook {
  private readonly instances = new Map<string, SqliteModelQuota>();

  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  override forOrg(orgId: string): ModelQuotaPort {
    const existing = this.instances.get(orgId);
    if (existing !== undefined) {
      return existing;
    }
    const created = new SqliteModelQuota(orgId, this.layout);
    this.instances.set(orgId, created);
    return created;
  }

  onModuleDestroy(): void {
    for (const instance of this.instances.values()) {
      instance.close();
    }
    this.instances.clear();
  }
}
