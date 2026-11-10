import {
  BridgeInboundPort,
  type BridgeInboundRequest,
} from '../../../../application/addons/bridge/bridge-inbound.port.ts';
import {
  type AddonNotifyOutcome,
  AddonNotifyPort,
} from '../../../../domain/addons/ports/addon-notify.port.ts';
import { ContentContributionPort } from '../../../../domain/content/content-contribution.port.ts';
import {
  AddonConfigFieldStore,
  ConfigFamilyModule,
  ConfigNotifier,
} from '../config/config.family.ts';
import { AddonContentRegistry, ContentFamilyModule } from '../content/content.family.ts';
import {
  AddonHookRoutingTable,
  HookDeliveryService,
  HookFamilyModule,
} from '../hook/hook.family.ts';
import { AddonJobScheduler, JobFamilyModule } from '../job/job.family.ts';
import { AddonLspRegistry, LspFamilyModule } from '../lsp/lsp.family.ts';
import { AddonMcpRegistry, McpFamilyModule } from '../mcp/mcp.family.ts';
import { AddonRouteTable, RouteFamilyModule } from '../route/route.family.ts';
import {
  AddonSourceKindRegistry,
  SourceKindFamilyModule,
} from '../source-kind/source-kind.family.ts';
import { ToolPackFamilyModule } from '../tool-pack/tool-pack.family.ts';
import {
  AddonTransportRegistry,
  TransportFamilyModule,
  TransportInboundService,
} from '../transport/transport.family.ts';
import { AddonTriggerCatalogContributor, TriggerFamilyModule } from '../trigger/trigger.family.ts';
import { AddonViewRegistry, ViewFamilyModule } from '../view/view.family.ts';
import {
  WorkerDescriptorStore,
  WorkerFamilyModule,
  WorkerReportService,
} from '../worker/worker.family.ts';
import { FakeAddonCallPort, FakeLogger, FakePackRegistry } from './fakes.ts';
import {
  FakeBindingRepository,
  FakeEventBus,
  FakeInstanceSupervisor,
  FakeJobStateRepository,
  FakeOrgAddonRepository,
  FakeTriggerInstanceRepository,
} from './repo-fakes.ts';
import { FakePackageCatalog } from './run-fakes.ts';

export interface FamilyBundle {
  toolPack: ToolPackFamilyModule;
  trigger: TriggerFamilyModule;
  job: JobFamilyModule;
  worker: WorkerFamilyModule;
  route: RouteFamilyModule;
  transport: TransportFamilyModule;
  hook: HookFamilyModule;
  content: ContentFamilyModule;
  config: ConfigFamilyModule;
  view: ViewFamilyModule;
  sourceKind: SourceKindFamilyModule;
  mcp: McpFamilyModule;
  lsp: LspFamilyModule;
  packs: FakePackRegistry;
  triggerContributor: AddonTriggerCatalogContributor;
  routeTable: AddonRouteTable;
  transportRegistry: AddonTransportRegistry;
  hookRouting: AddonHookRoutingTable;
  hookDelivery: HookDeliveryService;
  contentRegistry: AddonContentRegistry;
  configStore: AddonConfigFieldStore;
  viewRegistry: AddonViewRegistry;
  sourceKindRegistry: AddonSourceKindRegistry;
  mcpRegistry: AddonMcpRegistry;
  lspRegistry: AddonLspRegistry;
  workerStore: WorkerDescriptorStore;
  jobScheduler: AddonJobScheduler;
  jobState: FakeJobStateRepository;
  calls: FakeAddonCallPort;
  bindings: FakeBindingRepository;
  orgAddons: FakeOrgAddonRepository;
  supervisor: FakeInstanceSupervisor;
}

export function buildFamilyBundle(): FamilyBundle {
  const calls = new FakeAddonCallPort();
  const logger = new FakeLogger();
  const supervisor = new FakeInstanceSupervisor();
  const packs = new FakePackRegistry();
  const bindings = new FakeBindingRepository();
  const orgAddons = new FakeOrgAddonRepository();
  const instances = new FakeTriggerInstanceRepository();
  const jobState = new FakeJobStateRepository();
  const bus = new FakeEventBus();
  const catalog = new FakePackageCatalog();

  const triggerContributor = new AddonTriggerCatalogContributor(instances, bindings, orgAddons);
  const jobScheduler = new AddonJobScheduler(jobState, supervisor, calls, logger);
  const workerStore = new WorkerDescriptorStore();
  const workerReports = new WorkerReportService(workerStore, calls, logger);
  const routeTable = new AddonRouteTable();
  const transportRegistry = new AddonTransportRegistry();
  const transportInbound = new TransportInboundService(
    transportRegistry,
    new NoopBridgeInbound(),
    logger,
  );
  const hookRouting = new AddonHookRoutingTable();
  const hookDelivery = new HookDeliveryService(supervisor, calls, logger);
  const contentRegistry = new AddonContentRegistry();
  const configStore = new AddonConfigFieldStore();
  const viewRegistry = new AddonViewRegistry();
  const sourceKindRegistry = new AddonSourceKindRegistry();
  const mcpRegistry = new AddonMcpRegistry();
  const lspRegistry = new AddonLspRegistry();

  return {
    packs,
    triggerContributor,
    routeTable,
    transportRegistry,
    hookRouting,
    hookDelivery,
    contentRegistry,
    configStore,
    viewRegistry,
    sourceKindRegistry,
    mcpRegistry,
    lspRegistry,
    workerStore,
    jobScheduler,
    jobState,
    calls,
    bindings,
    orgAddons,
    supervisor,
    toolPack: new ToolPackFamilyModule(packs, calls),
    trigger: new TriggerFamilyModule(triggerContributor, calls, supervisor),
    job: new JobFamilyModule(jobScheduler, calls),
    worker: new WorkerFamilyModule(workerStore, workerReports, calls),
    route: new RouteFamilyModule(routeTable),
    transport: new TransportFamilyModule(transportRegistry, transportInbound, calls),
    hook: new HookFamilyModule(bus, hookRouting, hookDelivery),
    content: new ContentFamilyModule(
      contentRegistry,
      catalog,
      new NoopContentContributions(),
      logger,
    ),
    config: new ConfigFamilyModule(configStore, new ConfigNotifier(new NoopNotifyPort(), logger)),
    view: new ViewFamilyModule(viewRegistry),
    sourceKind: new SourceKindFamilyModule(sourceKindRegistry),
    mcp: new McpFamilyModule(mcpRegistry),
    lsp: new LspFamilyModule(lspRegistry),
  };
}

export function snapshotOf(bundle: FamilyBundle): string {
  return JSON.stringify({
    packs: [...bundle.packs.map.keys()].sort(),
    triggerKinds: bundle.triggerContributor
      .kinds('org-1')
      .map((kind) => kind.kind)
      .sort(),
    routes: bundle.routeTable
      .list('org-1', 'acme.test')
      .map((entry) => entry.routeId)
      .sort(),
    transports: bundle.transportRegistry
      .list('org-1')
      .map((entry) => entry.provider)
      .sort(),
    hookRoutes: bundle.hookRouting
      .candidates('org-1')
      .map((route) => route.hookId)
      .sort(),
    content: bundle.contentRegistry
      .list('org-1')
      .map((entry) => entry.contributionId)
      .sort(),
    configFields: bundle.configStore.fieldSpecs('org-1', 'acme.test').length,
    views: bundle.viewRegistry.has('org-1', 'acme.test'),
    sourceKinds: bundle.sourceKindRegistry.list('org-1').length,
    mcp: bundle.mcpRegistry.list('org-1').length,
    lsp: bundle.lspRegistry.list('org-1').length,
    workers: bundle.workerStore.allOf('org-1', 'acme.test').length,
  });
}

export class NoopNotifyPort extends AddonNotifyPort {
  override notify(
    _orgId: string,
    _addonId: string,
    _method: string,
    _params: unknown,
  ): AddonNotifyOutcome {
    return 'not_running';
  }
}

class NoopBridgeInbound extends BridgeInboundPort {
  override async execute(_request: BridgeInboundRequest): Promise<'skipped'> {
    return 'skipped';
  }
}

class NoopContentContributions extends ContentContributionPort {
  override register(): { dispose: () => void } {
    return { dispose: () => {} };
  }
}
