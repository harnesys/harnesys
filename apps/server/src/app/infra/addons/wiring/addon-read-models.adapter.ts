import { Injectable } from '@harnesys/brix';
import type { PermissionDefinition } from '../../../domain/addons/permissions.ts';
import type { AddonLogLineView } from '../../../domain/addons/ports/addon-read-models.port.ts';
import {
  AddonConfigReadPort,
  AddonDataExportPort,
  AddonLogReaderPort,
} from '../../../domain/addons/ports/addon-read-models.port.ts';
import { PermissionDefinitionsPort } from '../../../domain/addons/ports/permission-definitions.port.ts';
import type {
  AddonRouteEntryView,
  AddonRouteMatch,
} from '../../../domain/addons/ports/route-table.port.ts';
import { AddonRouteTablePort } from '../../../domain/addons/ports/route-table.port.ts';
import type { PermissionDefinitionRegistry } from '../dispatcher/permission-definitions.ts';
import type { AddonConfigReadModel } from '../families/config/config.family.ts';
import type { AddonRouteTable } from '../families/route/route.family.ts';
import type { AddonDbAccessAdapter } from './addon-db-access.adapter.ts';
import type { AddonLogSinkAdapter } from './addon-log-sink.adapter.ts';

@Injectable()
export class RouteTablePortAdapter extends AddonRouteTablePort {
  constructor(private readonly table: AddonRouteTable) {
    super();
  }

  override resolve(
    orgId: string,
    addonId: string,
    method: string,
    path: string,
  ): AddonRouteMatch | null {
    return this.table.resolve(orgId, addonId, method, path);
  }

  override list(orgId: string, addonId: string): AddonRouteEntryView[] {
    return this.table.list(orgId, addonId).map((entry) => ({
      routeId: entry.routeId,
      method: entry.method,
      path: entry.path,
      role: entry.role,
      exposure: entry.exposure,
      bodyLimitKb: entry.bodyLimitKb,
    }));
  }
}

@Injectable()
export class PermissionDefinitionsPortAdapter extends PermissionDefinitionsPort {
  constructor(private readonly registry: PermissionDefinitionRegistry) {
    super();
  }

  override get(id: string): PermissionDefinition | undefined {
    return this.registry.get(id);
  }

  override all(): readonly PermissionDefinition[] {
    return this.registry.all();
  }
}

@Injectable()
export class AddonLogReaderAdapter extends AddonLogReaderPort {
  constructor(private readonly sink: AddonLogSinkAdapter) {
    super();
  }

  override tail(orgId: string, addonId: string, since: number): AddonLogLineView[] {
    return this.sink.tail(orgId, addonId, since);
  }
}

const MAX_EXPORT_ROWS_PER_TABLE = 1000;

@Injectable()
export class AddonDataExportAdapter extends AddonDataExportPort {
  constructor(private readonly databases: AddonDbAccessAdapter) {
    super();
  }

  override async export(orgId: string, addonId: string): Promise<Record<string, unknown>> {
    const tables = (await this.databases.all(
      orgId,
      addonId,
      "select name from sqlite_master where type = 'table' and name not like 'sqlite_%'",
    )) as Array<{ name: string }>;
    const exported: Record<string, unknown> = {};
    for (const table of tables) {
      const name = table.name;
      if (!name) {
        continue;
      }
      exported[name] = await this.databases.all(
        orgId,
        addonId,
        `select * from "${name.replace(/"/g, '""')}" limit ${MAX_EXPORT_ROWS_PER_TABLE}`,
      );
    }
    return exported;
  }
}

@Injectable()
export class AddonConfigReadAdapter extends AddonConfigReadPort {
  constructor(private readonly readModel: AddonConfigReadModel) {
    super();
  }

  override values(orgId: string, addonId: string): Record<string, unknown> {
    return this.readModel.values(orgId, addonId);
  }
}
