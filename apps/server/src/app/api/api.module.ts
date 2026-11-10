import { APP_GUARD, Module } from '@harnesys/brix';
import { AgentUseCaseModule } from '../application/agents/agent.use-case.module.ts';
import { ApprovalUseCaseModule } from '../application/approvals/approval.use-case.module.ts';
import { AppsUseCaseModule } from '../application/apps/apps.use-case.module.ts';
import { AutomationUseCaseModule } from '../application/automations/automation.use-case.module.ts';
import { CapabilitiesUseCaseModule } from '../application/capabilities/capabilities.use-case.module.ts';
import { ConnectorUseCaseModule } from '../application/connectors/connector.use-case.module.ts';
import { ContentUseCaseModule } from '../application/content/content.use-case.module.ts';
import { EulaUseCaseModule } from '../application/eula/eula.use-case.module.ts';
import { ExecutionProfileUseCaseModule } from '../application/execution-profile/execution-profile.use-case.module.ts';
import { FileAccessUseCaseModule } from '../application/file-access/file-access.use-case.module.ts';
import { FleetUseCaseModule } from '../application/fleet/fleet.use-case.module.ts';
import { WorkerOrgOpsModule } from '../application/fleet/worker-org-ops.module.ts';
import { HookUseCaseModule } from '../application/hooks/hook.use-case.module.ts';
import { IdentityUseCaseModule } from '../application/identity/identity.use-case.module.ts';
import { IntegrationUseCaseModule } from '../application/integration/integration.use-case.module.ts';
import { IssueUseCaseModule } from '../application/issues/issue.use-case.module.ts';
import { KnowledgeUseCaseModule } from '../application/knowledge/knowledge.use-case.module.ts';
import { LspUseCaseModule } from '../application/lsp/lsp.use-case.module.ts';
import { ManagerUseCaseModule } from '../application/manager/manager.use-case.module.ts';
import { McpUseCaseModule } from '../application/mcp/mcp.use-case.module.ts';
import { MemoryUseCaseModule } from '../application/memory/memory.use-case.module.ts';
import { ModePresetsUseCaseModule } from '../application/mode-presets/mode-presets.use-case.module.ts';
import { AudioUseCaseModule } from '../application/model-execution/audio.use-case.module.ts';
import { ImageUseCaseModule } from '../application/model-execution/image.use-case.module.ts';
import { OrgMachineUseCaseModule } from '../application/org-machine/org-machine.use-case.module.ts';
import { PluginsUseCaseModule } from '../application/plugins/plugins.use-case.module.ts';
import { PresetUseCaseModule } from '../application/presets/preset.use-case.module.ts';
import { ProviderUseCaseModule } from '../application/providers/provider.use-case.module.ts';
import { ReleaseUseCaseModule } from '../application/release/release.use-case.module.ts';
import { ScheduleUseCaseModule } from '../application/schedules/schedule.use-case.module.ts';
import { SkillsUseCaseModule } from '../application/skills/skills.use-case.module.ts';
import { SourceUseCaseModule } from '../application/source/source.use-case.module.ts';
import { TeamsUseCaseModule } from '../application/teams/teams.use-case.module.ts';
import { TerminalUseCaseModule } from '../application/terminal/terminal.use-case.module.ts';
import { ThreadUseCaseModule } from '../application/threads/thread.use-case.module.ts';
import { ToolchainUseCaseModule } from '../application/toolchain/toolchain.use-case.module.ts';
import { UsageUseCaseModule } from '../application/usage/usage.use-case.module.ts';
import { BrowserUseCaseModule } from '../application/use-cases/browser/browser.use-case.module.ts';
import { VaultUseCaseModule } from '../application/vault/vault.use-case.module.ts';
import { WebhookUseCaseModule } from '../application/webhooks/webhook.use-case.module.ts';
import { AddonsModule } from '../infra/addons/addons.module.ts';
import { ConnectorModule } from '../infra/connector/connector.module.ts';
import { DeskModule } from '../infra/desk/desk.module.ts';
import { EventsWatchModule } from '../infra/events-watch/events-watch.module.ts';
import { FleetHubModule } from '../infra/fleet-hub/fleet-hub.module.ts';
import { IntegrationModule } from '../infra/integrations/integration.module.ts';
import { IssueInfraModule } from '../infra/issues/issue.module.ts';
import { MachineHomeModule } from '../infra/machine-home/machine-home.module.ts';
import { ReleaseModule } from '../infra/release/release.module.ts';
import { RuntimeModule } from '../infra/runtime/runtime.module.ts';
import { SkillsModule } from '../infra/skills/skills.module.ts';
import { SourceWatchModule } from '../infra/source/source-watch.module.ts';
import { TerminalModule } from '../infra/terminal/terminal.module.ts';
import { SessionGuard } from './guards/session.guard.ts';
import { AccountsController } from './rest/accounts.controller.ts';
import { AddonsController } from './rest/addons.controller.ts';
import { AgentHooksController } from './rest/agent-hooks.controller.ts';
import { AgentsController } from './rest/agents.controller.ts';
import { ApprovalsController } from './rest/approvals.controller.ts';
import { AppsController } from './rest/apps.controller.ts';
import { AppsCatalogController } from './rest/apps-catalog.controller.ts';
import { AppsConnectPublicController } from './rest/apps-connect-public.controller.ts';
import { AppsHookController } from './rest/apps-hook.controller.ts';
import { AppsOAuthCallbackController } from './rest/apps-oauth-callback.controller.ts';
import { AuditController } from './rest/audit.controller.ts';
import { AutomationsController } from './rest/automations.controller.ts';
import { BoardsController } from './rest/boards.controller.ts';
import { BrowserController } from './rest/browser.controller.ts';
import { CapabilitiesController } from './rest/capabilities.controller.ts';
import { CatalogController } from './rest/catalog.controller.ts';
import { ConnectController } from './rest/connect.controller.ts';
import { ConnectorsController } from './rest/connectors.controller.ts';
import { ContentController } from './rest/content.controller.ts';
import { DiscoveryController } from './rest/discovery.controller.ts';
import { EulaController } from './rest/eula.controller.ts';
import { EventsWatchController } from './rest/events-watch.controller.ts';
import { FileRulesController } from './rest/file-rules.controller.ts';
import { FleetController } from './rest/fleet.controller.ts';
import { FleetCloudController } from './rest/fleet-cloud.controller.ts';
import { FleetNodesController } from './rest/fleet-nodes.controller.ts';
import { HealthController } from './rest/health.controller.ts';
import { HostBrowseController } from './rest/host-browse.controller.ts';
import { HostSkillsController } from './rest/host-skills.controller.ts';
import { IdentityLinksController } from './rest/identity-links.controller.ts';
import { IntegrationRoutesController } from './rest/integration-routes.controller.ts';
import { IntegrationsController } from './rest/integrations.controller.ts';
import { IntegrationsGithubController } from './rest/integrations-github.controller.ts';
import { IntegrationsGoogleCallbackController } from './rest/integrations-google-callback.controller.ts';
import { IssuesController } from './rest/issues.controller.ts';
import { KnowledgeController } from './rest/knowledge.controller.ts';
import { KnowledgeOrgController } from './rest/knowledge-org.controller.ts';
import { LabelsController } from './rest/labels.controller.ts';
import { LspController } from './rest/lsp.controller.ts';
import { McpController } from './rest/mcp.controller.ts';
import { InvitesController, MembersController } from './rest/members.controller.ts';
import { MemoryController, MemoryStatusController } from './rest/memory.controller.ts';
import { ModePresetsController } from './rest/mode-presets.controller.ts';
import { ModelImageController } from './rest/model-image.controller.ts';
import { ModelSpeechController } from './rest/model-speech.controller.ts';
import { ModelTranscriptionController } from './rest/model-transcription.controller.ts';
import { ModelVoicesController } from './rest/model-voices.controller.ts';
import { OrgGitController } from './rest/org-git.controller.ts';
import { OrgsController } from './rest/orgs.controller.ts';
import { PermissionRulesController } from './rest/permission-rules.controller.ts';
import { PlacementQueueController } from './rest/placement-queue.controller.ts';
import {
  PluginCatalogController,
  PluginRegistriesController,
} from './rest/plugin-registries.controller.ts';
import { PluginsController } from './rest/plugins.controller.ts';
import { PresetsController } from './rest/presets.controller.ts';
import { ProvidersController } from './rest/providers.controller.ts';
import { SchedulesController } from './rest/schedules.controller.ts';
import { SessionController } from './rest/session.controller.ts';
import { SkillsController } from './rest/skills.controller.ts';
import { SkillsSearchController } from './rest/skills-search.controller.ts';
import { SourceGitController } from './rest/source-git.controller.ts';
import { SourceMaterializeController } from './rest/source-materialize.controller.ts';
import { SourceVcsController } from './rest/source-vcs.controller.ts';
import { SourceWorktreesController } from './rest/source-worktrees.controller.ts';
import { SourcesController } from './rest/sources.controller.ts';
import { TeamsController } from './rest/teams.controller.ts';
import { OrgTerminalsController, TerminalsController } from './rest/terminals.controller.ts';
import { ThreadAttachmentsController } from './rest/thread-attachments.controller.ts';
import { ThreadCompactController } from './rest/thread-compact.controller.ts';
import { ThreadFilesController } from './rest/thread-files.controller.ts';
import { ThreadMessageQueueController } from './rest/thread-message-queue.controller.ts';
import { ThreadRawModelRequestsController } from './rest/thread-raw-model-requests.controller.ts';
import { ThreadsController } from './rest/threads.controller.ts';
import { ToolchainController } from './rest/toolchain.controller.ts';
import { UsageController } from './rest/usage.controller.ts';
import { VaultController } from './rest/vault.controller.ts';
import { OrgHooksController, WebhooksController } from './rest/webhooks.controller.ts';

@Module({
  imports: [
    OrgMachineUseCaseModule,
    EulaUseCaseModule,
    ReleaseModule,
    ReleaseUseCaseModule,
    FleetUseCaseModule,
    ExecutionProfileUseCaseModule,
    WorkerOrgOpsModule,
    SourceUseCaseModule,
    IntegrationUseCaseModule,
    ContentUseCaseModule,
    ProviderUseCaseModule,
    ImageUseCaseModule,
    AudioUseCaseModule,
    IssueUseCaseModule,
    IssueInfraModule,
    ConnectorModule,
    DeskModule,
    EventsWatchModule,
    IntegrationModule,
    ManagerUseCaseModule,
    KnowledgeUseCaseModule,
    VaultUseCaseModule,
    AgentUseCaseModule,
    FileAccessUseCaseModule,
    HookUseCaseModule,
    CapabilitiesUseCaseModule,
    SkillsUseCaseModule,
    TerminalUseCaseModule,
    TerminalModule,
    McpUseCaseModule,
    ModePresetsUseCaseModule,
    PluginsUseCaseModule,
    PresetUseCaseModule,
    LspUseCaseModule,
    ToolchainUseCaseModule,
    BrowserUseCaseModule,
    ThreadUseCaseModule,
    ApprovalUseCaseModule,
    AppsUseCaseModule,
    AutomationUseCaseModule,
    ScheduleUseCaseModule,
    TeamsUseCaseModule,
    ConnectorUseCaseModule,
    WebhookUseCaseModule,
    IdentityUseCaseModule,
    UsageUseCaseModule,
    MemoryUseCaseModule,
    RuntimeModule,
    SkillsModule,
    SourceWatchModule,
    FleetHubModule,
    MachineHomeModule,
    AddonsModule,
  ],
  controllers: [
    HealthController,
    EulaController,
    AgentHooksController,
    OrgsController,
    SessionController,
    MembersController,
    AuditController,
    InvitesController,
    IdentityLinksController,
    OrgGitController,
    IntegrationsGoogleCallbackController,
    IntegrationsGithubController,
    IntegrationsController,
    IntegrationRoutesController,
    AppsCatalogController,
    AppsController,
    AccountsController,
    ConnectController,
    AppsOAuthCallbackController,
    AppsConnectPublicController,
    AppsHookController,
    FleetController,
    FleetCloudController,
    FleetNodesController,
    PlacementQueueController,
    DiscoveryController,
    HostBrowseController,
    SourcesController,
    SourceVcsController,
    SourceGitController,
    SourceMaterializeController,
    SourceWorktreesController,
    TerminalsController,
    OrgTerminalsController,
    ContentController,
    ProvidersController,
    KnowledgeController,
    KnowledgeOrgController,
    VaultController,
    AgentsController,
    AutomationsController,
    FileRulesController,
    PermissionRulesController,
    CapabilitiesController,
    CatalogController,
    SkillsController,
    SkillsSearchController,
    HostSkillsController,
    McpController,
    ModePresetsController,
    PluginsController,
    PluginRegistriesController,
    PluginCatalogController,
    PresetsController,
    LspController,
    ToolchainController,
    AddonsController,
    BrowserController,
    ThreadsController,
    ThreadAttachmentsController,
    ThreadFilesController,
    ThreadCompactController,
    ThreadMessageQueueController,
    ThreadRawModelRequestsController,
    ApprovalsController,
    SchedulesController,
    ConnectorsController,
    WebhooksController,
    BoardsController,
    IssuesController,
    LabelsController,
    OrgHooksController,
    EventsWatchController,
    UsageController,
    MemoryController,
    MemoryStatusController,
    TeamsController,
    ModelImageController,
    ModelSpeechController,
    ModelTranscriptionController,
    ModelVoicesController,
  ],
  providers: [{ provide: APP_GUARD, useClass: SessionGuard }],
})
export class ApiModule {}
