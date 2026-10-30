import { Module } from '@harnesys/brix';
import { PlanEventsPort } from '../../domain/plan/plan-events.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { ThreadEventsPort } from '../../domain/thread/thread-events.port.ts';
import { WaitTickerGatePort } from '../../domain/thread/wait-ticker-gate.port.ts';
import { AgentModule } from '../agent/agent.module.ts';
import { HookRunModule } from '../agent/hook-run.module.ts';
import { ApprovalModule } from '../approvals/approval.module.ts';
import { BrowserModule } from '../browser/browser.module.ts';
import { DeskModule } from '../desk/desk.module.ts';
import { FileAccessModule } from '../file-access/file-access.module.ts';
import { FleetHubModule } from '../fleet-hub/fleet-hub.module.ts';
import { IssueInfraModule } from '../issues/issue.module.ts';
import { KnowledgeModule } from '../knowledge/knowledge.module.ts';
import { LspModule } from '../lsp/lsp.module.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { McpModule } from '../mcp/mcp.module.ts';
import { ModePresetsModule } from '../mode-presets/mode-presets.module.ts';
import { PlanModule } from '../plan/plan.module.ts';
import { PluginsModule } from '../plugins/plugins.module.ts';
import { WorkspaceContainerModule } from '../process-runtime/workspace-container.module.ts';
import { ProviderModule } from '../provider/provider.module.ts';
import { ScheduleModule } from '../schedules/schedule.module.ts';
import { SecretModule } from '../secret/secret.module.ts';
import { SkillsModule } from '../skills/skills.module.ts';
import { SourceModule } from '../source/source.module.ts';
import { ThreadModule } from '../thread/thread.module.ts';
import { WebhookModule } from '../webhooks/webhook.module.ts';
import { LocalExecutorAdapter } from './local-executor.adapter.ts';
import { WaitTickerGateAdapter } from './wait-ticker-gate.adapter.ts';

@Module({
  imports: [
    MachineHomeModule,
    PluginsModule,
    SkillsModule,
    ThreadModule,
    AgentModule,
    HookRunModule,
    ModePresetsModule,
    SourceModule,
    ProviderModule,
    SecretModule,
    ApprovalModule,
    FileAccessModule,
    PlanModule,
    DeskModule,
    ScheduleModule,
    WebhookModule,
    KnowledgeModule,
    LspModule,
    McpModule,
    IssueInfraModule,
    WorkspaceContainerModule,
    FleetHubModule,
    BrowserModule,
  ],
  providers: [
    { provide: WaitTickerGatePort, useClass: WaitTickerGateAdapter },
    { provide: LocalExecutorPort, useClass: LocalExecutorAdapter },
  ],
  exports: [LocalExecutorPort, PlanEventsPort, ThreadEventsPort, WaitTickerGatePort],
})
export class RuntimeModule {}
