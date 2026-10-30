import type { Logger } from '@harnesys/brix';
import type { AcceptedRunResponse } from '@harnesys/contracts';
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
import type { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import type { HookRunStorePort } from '../../domain/agent/hook-run-store.port.ts';
import type { ApprovalEventsPort } from '../../domain/approval/approval-events.port.ts';
import type { ApprovalStorePort } from '../../domain/approval/approval-store.port.ts';
import type { DeskEventsPort } from '../../domain/desk/desk-events.port.ts';
import type { FileAccessRulePort } from '../../domain/file-access/file-access-rule.port.ts';
import type { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import type { NodeCommandQueuePort } from '../../domain/fleet/node-command-queue.port.ts';
import type { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import type { RunIsolation } from '../../domain/fleet/placement.ts';
import type { IssueExecutionPort } from '../../domain/issue/issue-execution.port.ts';
import type { LspPort } from '../../domain/lsp/lsp.port.ts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import type { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';
import type { PlanEventsPort } from '../../domain/plan/plan-events.port.ts';
import type { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import type { WorkspaceContainerPort } from '../../domain/process-runtime/workspace-container.port.ts';
import type { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import type { ScheduleRepositoryPort } from '../../domain/schedule/schedule-repository.port.ts';
import type { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import type { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import type { SourceSkillsPort } from '../../domain/skills/source-skills.port.ts';
import type { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import type { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import type { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import type { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import type { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import type {
  CompactThreadResult,
  ThreadQueueDrainResult,
} from '../../domain/thread/local-executor.port.ts';
import type { ThreadEventsPort } from '../../domain/thread/thread-events.port.ts';
import type { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import type { WaitTickerGatePort } from '../../domain/thread/wait-ticker-gate.port.ts';
import type { WebhookRepositoryPort } from '../../domain/webhook/webhook-repository.port.ts';
import type { OrgGithubDeps } from './packs/org-github.port.ts';
import type { OrgGoogleDeps } from './packs/org-google.port.ts';
import type { OrgIssueDeps } from './packs/org-issue.port.ts';
import type { OrgKnowledgeDeps } from './packs/org-knowledge.port.ts';
import type { OrgManagerDeps } from './packs/org-manager.port.ts';
import type { OrgSkillsDeps } from './packs/org-skills.pack.port.ts';

export interface OrgRuntime {
  orgId: string;
  lifecycle: RunLifecycleStore;
  events: RunEventStore;
  feed: RunEventFeed;
  sessionFor(threadId: string): Promise<SessionHandle>;
  send(input: {
    threadId: string;
    text?: string;
    effort?: string;
    attachments?: Attachment[];
    skills?: string[];
    clientEventId?: string;
    origin?: string;
    correlationId?: string;
    sourceId?: string;
    worktreeId?: string;
    isolation?: RunIsolation;
    branch?: string;
    attribution?: RunAttribution;
  }): Promise<AcceptedRunResponse>;
  compact(threadId: string): Promise<CompactThreadResult>;
  drainMessageQueue(threadId: string): Promise<ThreadQueueDrainResult>;
  cancel(runId: string): Promise<void>;
  retry(runId: string): Promise<{ runId: string }>;
  truncateThread(threadId: string, runId: string, seq: number): Promise<TruncateThreadResult>;
  removeThreadEvent(threadId: string, runId: string, seq: number): Promise<SessionEvent>;
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
  plugins: PluginRuntimePort;
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
  schedules?: ScheduleRepositoryPort;
  webhooks?: WebhookRepositoryPort;
  knowledge?: OrgKnowledgeDeps;
  issues?: OrgIssueDeps;
  issueExecutions?: IssueExecutionPort;
  manager?: OrgManagerDeps;
  google?: OrgGoogleDeps;
  github?: OrgGithubDeps;
  skills?: OrgSkillsDeps;
  waitGate?: WaitTickerGatePort;
}
