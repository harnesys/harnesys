import type { ModuleDestroyHook, ModuleInitHook } from '@harnesys/brix';
import { Injectable, Logger, NotFoundException } from '@harnesys/brix';
import type { AutomationConnection, AutomationItem, AutomationKind } from '@harnesys/contracts';
import type {
  AddonConnectionState,
  AutomationUpsertInput,
  IntegrationContext,
  IntegrationDefinition,
  IntegrationRoute,
} from 'harnesys/integration';
import { resolveIntegrationRoute } from 'harnesys/integration';
import { SendThreadRunUseCase } from '../../application/threads/send-thread-run.use-case.ts';
import { EventsWatchHubPort } from '../../domain/events-watch/events-watch-hub.port.ts';
import { AddonDatabasePort } from '../../domain/integration/addon-database.port.ts';
import {
  IntegrationHostPort,
  type IntegrationRequest,
} from '../../domain/integration/integration-host.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { ScheduleRepositoryPort } from '../../domain/schedule/schedule-repository.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { WebhookRepositoryPort } from '../../domain/webhook/webhook-repository.port.ts';
import { createAddonSecrets } from './addon-secrets.ts';
import { AddonWorkersRunner } from './addon-workers.ts';
import {
  AutomationSnapshots,
  CORE_AUTOMATION_KINDS,
  mergeAutomationItems,
  toAutomationKindContributions,
} from './automation-items.ts';
import { INSTALLED_INTEGRATIONS, installedIntegration } from './installed-integrations.ts';
import {
  createAddonEvents,
  createAddonLogger,
  createAddonRuns,
  createAddonThreads,
} from './integration-context.ts';

interface BootedIntegration {
  orgId: string;
  integrationId: string;
  definition: IntegrationDefinition;
  context: IntegrationContext;
  workers: AddonWorkersRunner;
}

@Injectable()
export class IntegrationHost
  extends IntegrationHostPort
  implements ModuleInitHook, ModuleDestroyHook
{
  private readonly log: Logger;
  private readonly booted = new Map<string, BootedIntegration>();
  private readonly snapshots = new AutomationSnapshots();
  private readonly connections = new Map<string, AddonConnectionState>();
  private stopped = false;

  constructor(
    private readonly orgs: OrgMachineStore,
    private readonly machineConfig: MachineConfigPort,
    private readonly databases: AddonDatabasePort,
    private readonly secrets: SecretStorePort,
    private readonly schedules: ScheduleRepositoryPort,
    private readonly webhooks: WebhookRepositoryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly sendThreadRun: SendThreadRunUseCase,
    private readonly hub: EventsWatchHubPort,
    logger: Logger,
  ) {
    super();
    this.log = logger.child('integration-host');
  }

  async onModuleInit(): Promise<void> {
    for (const entry of this.orgs.list()) {
      if (entry.role !== 'relay') {
        continue;
      }
      await this.sync(entry.orgId);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    for (const entry of this.booted.values()) {
      await entry.workers.stopAll();
      try {
        await entry.definition.stop?.(entry.context);
      } catch (error) {
        this.log.warn(
          { orgId: entry.orgId, integrationId: entry.integrationId, err: errorText(error) },
          'integration stop failed',
        );
      }
      this.databases.close(entry.orgId, entry.integrationId);
    }
    this.booted.clear();
    this.snapshots.clear();
    this.connections.clear();
  }

  async sync(orgId: string): Promise<void> {
    for (const definition of INSTALLED_INTEGRATIONS) {
      await this.boot(orgId, definition);
    }
  }

  override automationItems(orgId: string): AutomationItem[] {
    return mergeAutomationItems({
      orgId,
      schedules: this.schedules.listByOrg(orgId),
      webhooks: this.webhooks.listByOrg(orgId),
      addons: this.snapshots.forOrg(orgId).map((source) => ({
        integrationId: source.integrationId,
        connection: this.connectionOf(orgId, source.integrationId),
        items: source.items,
      })),
    });
  }

  override automationKinds(orgId: string): AutomationKind[] {
    const kinds = [...CORE_AUTOMATION_KINDS];
    for (const definition of INSTALLED_INTEGRATIONS) {
      for (const kind of toAutomationKindContributions(definition)) {
        const connection = this.connectionOf(orgId, definition.id);
        if (kind.requiresConnection && !connection.connected) {
          continue;
        }
        kinds.push({ ...kind, connected: connection.connected });
      }
    }
    return kinds;
  }

  routes(integrationId: string): IntegrationRoute[] {
    return installedIntegration(integrationId)?.routes ?? [];
  }

  override async handle(request: IntegrationRequest): Promise<Response> {
    const { orgId, integrationId, method, pathname, query, body } = request;
    const definition = installedIntegration(integrationId);
    if (!definition) {
      throw new NotFoundException(`Integration not found: ${integrationId}`);
    }
    if (!this.orgs.get(orgId)) {
      throw new NotFoundException(`Organization not found: ${orgId}`);
    }
    const entry = await this.boot(orgId, definition);
    if (!entry) {
      throw new NotFoundException(`Integration not available: ${integrationId}`);
    }
    const resolved = resolveIntegrationRoute(
      definition.routes ?? [],
      method,
      pathname,
      query,
      body,
    );
    if (!resolved) {
      throw new NotFoundException(`Route ${method} ${pathname} not found`);
    }
    const result = await resolved.route.handler(entry.context, resolved.request);
    const status = result.status ?? 200;
    if (status === 204) {
      return new Response(null, { status });
    }
    return Response.json(result.body ?? null, { status });
  }

  private connectionOf(orgId: string, integrationId: string): AutomationConnection {
    const definition = installedIntegration(integrationId);
    if (!definition?.connection) {
      return { required: false, connected: true };
    }
    const state = this.connections.get(stateKey(orgId, integrationId));
    return {
      required: true,
      connected: state?.connected ?? false,
      label: state?.label,
      detail: state?.detail,
    };
  }

  private async boot(
    orgId: string,
    definition: IntegrationDefinition,
  ): Promise<BootedIntegration | null> {
    if (this.stopped) {
      return null;
    }
    const key = stateKey(orgId, definition.id);
    const existing = this.booted.get(key);
    if (existing) {
      return existing;
    }
    const logger = createAddonLogger(this.log, definition.id);
    const db = this.databases.open(orgId, definition.id);
    const workers = new AddonWorkersRunner({
      db,
      machineId: this.machineConfig.get().id,
      canRun: () => this.orgs.get(orgId)?.role === 'relay',
      logger,
    });
    const context: IntegrationContext = {
      orgId,
      integrationId: definition.id,
      db,
      secrets: createAddonSecrets(this.secrets, orgId, definition.id),
      workers,
      automations: {
        publish: (items: AutomationUpsertInput[]) => {
          this.snapshots.publish(orgId, definition.id, items);
          void this.refreshConnection(orgId, definition);
        },
      },
      threads: createAddonThreads(
        { threads: this.threads, threadAgents: this.threadAgents },
        orgId,
      ),
      runs: createAddonRuns({ sendThreadRun: this.sendThreadRun }, orgId, logger),
      events: createAddonEvents(this.hub, orgId),
      logger,
    };
    const entry: BootedIntegration = {
      orgId,
      integrationId: definition.id,
      definition,
      context,
      workers,
    };
    this.booted.set(key, entry);
    try {
      await definition.setup?.(context);
      await definition.start?.(context);
    } catch (error) {
      this.log.error(
        { orgId, integrationId: definition.id, err: errorText(error) },
        'integration boot failed',
      );
    }
    await this.refreshConnection(orgId, definition);
    return entry;
  }

  private async refreshConnection(orgId: string, definition: IntegrationDefinition): Promise<void> {
    if (!definition.connection) {
      return;
    }
    const entry = this.booted.get(stateKey(orgId, definition.id));
    if (!entry) {
      return;
    }
    try {
      this.connections.set(
        stateKey(orgId, definition.id),
        await definition.connection(entry.context),
      );
    } catch (error) {
      this.log.warn(
        { orgId, integrationId: definition.id, err: errorText(error) },
        'integration connection state failed',
      );
    }
  }
}

function stateKey(orgId: string, integrationId: string): string {
  return `${orgId}:${integrationId}`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
