import type { Logger } from '@harnesys/brix';
import type { RunAcceptedResponse } from '@harnesys/contracts';
import type {
  Attachment,
  HostEngineEntry,
  McpManagePort,
  McpServerInfo,
  RunAttribution,
  RunEventFeed,
  RunEventStore,
  RunLifecycleStore,
  SessionEvent,
  SessionHandle,
  StdioEntry,
  TruncateThreadResult,
  UrlEntry,
} from 'harnesys';
import { TriggerInstanceRepositoryPort } from '../../domain/addons/ports/trigger-instance-repository.port.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { HookRunStorePort } from '../../domain/agent/hook-run-store.port.ts';
import { ApprovalEventsPort } from '../../domain/approval/approval-events.port.ts';
import { ApprovalStorePort } from '../../domain/approval/approval-store.port.ts';
import { PackRegistryPort } from '../../domain/capabilities/pack-registry.port.ts';
import { DeskEventsPort } from '../../domain/desk/desk-events.port.ts';
import { FileAccessRulePort } from '../../domain/file-access/file-access-rule.port.ts';
import { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import { NodeCommandQueuePort } from '../../domain/fleet/node-command-queue.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import type { RunIsolation } from '../../domain/fleet/placement.ts';
import { IssueExecutionPort } from '../../domain/issue/issue-execution.port.ts';
import { LspPort } from '../../domain/lsp/lsp.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';
import { PermissionRuleStorePort } from '../../domain/permissions/permission-rule-store.port.ts';
import { PlanEventsPort } from '../../domain/plan/plan-events.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { WorkspaceContainerPort } from '../../domain/process-runtime/workspace-container.port.ts';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { ScheduleRepositoryPort } from '../../domain/schedule/schedule-repository.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { SourceSkillsPort } from '../../domain/skills/source-skills.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { TerminalSessionsPort } from '../../domain/terminal/terminal-session.port.ts';
import type {
  CompactThreadResult,
  ThreadQueueDrainResult,
} from '../../domain/thread/local-executor.port.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadEventsPort } from '../../domain/thread/thread-events.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { WaitTickerGatePort } from '../../domain/thread/wait-ticker-gate.port.ts';
import { WebhookRepositoryPort } from '../../domain/webhook/webhook-repository.port.ts';
import type { OrgGithubDeps } from './packs/org-github.port.ts';
import type { OrgGoogleDeps } from './packs/org-google.port.ts';
import type { OrgIssueDeps } from './packs/org-issue.port.ts';
import type { OrgKnowledgeDeps } from './packs/org-knowledge.port.ts';
import type { OrgManagerDeps } from './packs/org-manager.port.ts';
import type { OrgSkillsDeps } from './packs/org-skills.pack.port.ts';
import type { OrgTelegramDeps } from './packs/org-telegram.port.ts';

export interface OrgRuntime {
  orgId: string;
  lifecycle: RunLifecycleStore;
  events: RunEventStore;
  feed: RunEventFeed;
  sessionFor(threadId: string, agentId: string): Promise<SessionHandle>;
  send(input: {
    threadId: string;
    text?: string;
    effort?: string;
    mode?: string;
    attachments?: Attachment[];
    skills?: string[];
    clientEventId?: string;
    origin?: string;
    originConnectorId?: string;
    correlationId?: string;
    sourceId?: string;
    worktreeId?: string;
    isolation?: RunIsolation;
    branch?: string;
    attribution?: RunAttribution;
    agentId: string;
    triggerThreadSeq?: number;
  }): Promise<RunAcceptedResponse>;
  compact(threadId: string): Promise<CompactThreadResult>;
  drainMessageQueue(threadId: string): Promise<ThreadQueueDrainResult>;
  cancel(runId: string): Promise<void>;
  retry(runId: string): Promise<{ runId: string }>;
  truncateThread(threadId: string, threadSeq: number): Promise<TruncateThreadResult>;
  removeThreadEvent(threadId: string, threadSeq: number): Promise<SessionEvent>;
  stream(runId: string, fromSeq?: number): AsyncIterable<SessionEvent>;
  tickWaitTimers(): Promise<number>;
  listMcpServers(): Promise<McpServerInfo[]>;
  reloadMcp(serverId: string, entry: StdioEntry | UrlEntry | null): Promise<void>;
  close(): void;
  closeWhenIdle(): void;
}

export interface OrgRuntimeDeps {
  orgId: string;
  logger?: Logger;
  layout: HostFsLayoutPort;
  machineConfig: MachineConfigPort;
  containers: WorkspaceContainerPort;
  nodes?: NodeRepository;
  threads: ThreadRepositoryPort;
  threadAgents: ThreadAgentRepositoryPort;
  agents: AgentRegistryPort;
  hookRuns?: HookRunStorePort;
  modes: ModePresetRegistryPort;
  sources: SourceRegistryPort;
  sourceLocation: SourceLocationPort;
  materializations: SourceMaterializationPort;
  worktrees?: RepositoryWorktreePort;
  sourceDriver?: SourceDriverPort;
  providers: LlmProviderPort;
  models: LlmModelPort;
  secrets: SecretStorePort;
  fileRules: FileAccessRulePort;
  permissionRules?: PermissionRuleStorePort;
  plugins: PluginRuntimePort;
  packRegistry: PackRegistryPort;
  sourceSkills: SourceSkillsPort;
  orgSettings: OrgSettingsPort;
  mcpManage?: McpManagePort;
  browserEngines?: { snapshot: () => Promise<HostEngineEntry[]> };
  lsp?: LspPort;
  approvals?: ApprovalStorePort;
  approvalEvents?: ApprovalEventsPort;
  claims?: EventClaimPort;
  commands?: NodeCommandQueuePort;
  planEvents?: PlanEventsPort;
  threadEvents?: ThreadEventsPort;
  deskEvents?: DeskEventsPort;
  terminalSessions?: TerminalSessionsPort;
  schedules?: ScheduleRepositoryPort;
  webhooks?: WebhookRepositoryPort;
  triggerInstances?: TriggerInstanceRepositoryPort;
  knowledge?: OrgKnowledgeDeps;
  issues?: OrgIssueDeps;
  issueExecutions?: IssueExecutionPort;
  manager?: OrgManagerDeps;
  google?: OrgGoogleDeps;
  github?: OrgGithubDeps;
  telegram?: OrgTelegramDeps;
  skills?: OrgSkillsDeps;
  waitGate?: WaitTickerGatePort;
}
