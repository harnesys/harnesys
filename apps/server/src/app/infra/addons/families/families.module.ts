import { Module } from '@harnesys/brix';
import { AddonsApplicationModule } from '../../../application/addons/addons-application.module.ts';
import { ContentContributionPort } from '../../../domain/content/content-contribution.port.ts';
import { CorePackRegistryModule } from '../../runtime/packs/core-pack-registry.module.ts';
import { AddonCatalogModule } from '../catalog/catalog.module.ts';
import { OrgSkillContributionAdapter } from '../storage/org-skill-contribution.adapter.ts';
import { AddonSupervisorModule } from '../supervisor/supervisor.module.ts';
import {
  AddonConfigFieldStore,
  AddonConfigReadModel,
  ConfigFamilyModule,
  ConfigNotifier,
} from './config/config.family.ts';
import { AddonContentRegistry, ContentFamilyModule } from './content/content.family.ts';
import { type AnyFamilyModule, FamilyModuleList } from './family-module-list.ts';
import {
  AddonHookRoutingTable,
  HookDeliveryService,
  HookFamilyModule,
} from './hook/hook.family.ts';
import { AddonJobScheduler, JobFamilyModule } from './job/job.family.ts';
import { AddonLspRegistry, LspFamilyModule } from './lsp/lsp.family.ts';
import { AddonMcpRegistry, McpFamilyModule } from './mcp/mcp.family.ts';
import { AddonRouteTable, RouteFamilyModule } from './route/route.family.ts';
import {
  AddonSourceKindRegistry,
  SourceKindFamilyModule,
} from './source-kind/source-kind.family.ts';
import { ToolPackFamilyModule } from './tool-pack/tool-pack.family.ts';
import {
  AddonTransportRegistry,
  TransportFamilyModule,
  TransportInboundService,
} from './transport/transport.family.ts';
import { AddonTriggerCatalogContributor, TriggerFamilyModule } from './trigger/trigger.family.ts';
import { TriggerFireService } from './trigger/trigger-fire.sink.ts';
import { AddonViewRegistry, ViewFamilyModule } from './view/view.family.ts';
import {
  WorkerDescriptorStore,
  WorkerFamilyModule,
  WorkerReportService,
} from './worker/worker.family.ts';

@Module({
  imports: [
    AddonsApplicationModule,
    AddonCatalogModule,
    AddonSupervisorModule,
    CorePackRegistryModule,
  ],
  providers: [
    AddonTriggerCatalogContributor,
    TriggerFireService,
    AddonJobScheduler,
    WorkerDescriptorStore,
    WorkerReportService,
    AddonRouteTable,
    AddonTransportRegistry,
    TransportInboundService,
    AddonHookRoutingTable,
    HookDeliveryService,
    AddonContentRegistry,
    { provide: ContentContributionPort, useClass: OrgSkillContributionAdapter },
    OrgSkillContributionAdapter,
    AddonConfigFieldStore,
    AddonConfigReadModel,
    ConfigNotifier,
    AddonViewRegistry,
    AddonSourceKindRegistry,
    AddonMcpRegistry,
    AddonLspRegistry,
    ToolPackFamilyModule,
    TriggerFamilyModule,
    JobFamilyModule,
    WorkerFamilyModule,
    RouteFamilyModule,
    TransportFamilyModule,
    HookFamilyModule,
    ContentFamilyModule,
    ConfigFamilyModule,
    ViewFamilyModule,
    SourceKindFamilyModule,
    McpFamilyModule,
    LspFamilyModule,
    {
      provide: FamilyModuleList,
      useFactory: (...modules: readonly AnyFamilyModule[]) => new FamilyModuleList([...modules]),
      inject: [
        ToolPackFamilyModule,
        TriggerFamilyModule,
        JobFamilyModule,
        WorkerFamilyModule,
        RouteFamilyModule,
        TransportFamilyModule,
        HookFamilyModule,
        ContentFamilyModule,
        ConfigFamilyModule,
        ViewFamilyModule,
        SourceKindFamilyModule,
        McpFamilyModule,
        LspFamilyModule,
      ],
    },
  ],
  exports: [
    FamilyModuleList,
    AddonTriggerCatalogContributor,
    TriggerFireService,
    AddonJobScheduler,
    WorkerDescriptorStore,
    WorkerReportService,
    AddonRouteTable,
    AddonTransportRegistry,
    TransportInboundService,
    AddonHookRoutingTable,
    HookDeliveryService,
    AddonContentRegistry,
    AddonConfigFieldStore,
    ConfigNotifier,
    AddonConfigReadModel,
    AddonViewRegistry,
    AddonSourceKindRegistry,
    AddonMcpRegistry,
    AddonLspRegistry,
    TriggerFamilyModule,
    WorkerFamilyModule,
    TransportFamilyModule,
  ],
})
export class AddonFamiliesModule {}
