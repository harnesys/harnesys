import { Injectable } from '@harnesys/brix';
import type { HostServiceModule } from '../../../domain/addons/host-service.ts';
import { HostServiceRegistryPort } from '../../../domain/addons/ports/host-service-registry.port.ts';
import { AccountsHostService } from './accounts/accounts-service.ts';
import { BridgeHostService } from './bridge/bridge-service.ts';
import { ConfigHostService } from './config/config-service.ts';
import { DbHostService } from './db/db-service.ts';
import { EventsHostService } from './events/events-service.ts';
import { FilesHostService } from './files/files-service.ts';
import { HttpHostService } from './http/http-service.ts';
import { LogHostService } from './log/log-service.ts';
import { RunsHostService } from './runs/runs-service.ts';
import { SecretsHostService } from './secrets/secrets-service.ts';
import { TriggersHostService } from './triggers/triggers-service.ts';
import { WorkersHostService } from './workers/workers-service.ts';

@Injectable()
export class HostServicesIndex {
  readonly modules: readonly HostServiceModule[];

  constructor(
    registry: HostServiceRegistryPort,
    config: ConfigHostService,
    secrets: SecretsHostService,
    db: DbHostService,
    log: LogHostService,
    events: EventsHostService,
    http: HttpHostService,
    files: FilesHostService,
    accounts: AccountsHostService,
    runs: RunsHostService,
    triggers: TriggersHostService,
    bridge: BridgeHostService,
    workers: WorkersHostService,
  ) {
    this.modules = [
      config,
      secrets,
      db,
      log,
      events,
      http,
      files,
      accounts,
      runs,
      triggers,
      bridge,
      workers,
    ];
    assertUniqueMethodNames(this.modules);
    this.registry = registry;
  }

  private readonly registry: HostServiceRegistryPort;

  onModuleInit(): void {
    this.registerInto(this.registry);
  }

  registerInto(registry: HostServiceRegistryPort): void {
    for (const module of this.modules) {
      registry.register(module);
    }
    const violations = registry.validateBoot();
    if (violations.length > 0) {
      throw new Error(
        `host service registry invalid: ${violations.map((v) => `${v.namespace}.${v.method} ${v.code}`).join('; ')}`,
      );
    }
  }
}

function assertUniqueMethodNames(modules: readonly HostServiceModule[]): void {
  const seen = new Map<string, string>();
  for (const module of modules) {
    for (const method of module.methods) {
      const owner = seen.get(method.name);
      if (owner) {
        throw new Error(
          `duplicate host method '${method.name}' in '${owner}' and '${module.namespace}'`,
        );
      }
      seen.set(method.name, module.namespace);
    }
  }
}
