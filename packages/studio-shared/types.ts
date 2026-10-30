export type {
  AgentHook,
  AgentHookEffect,
  AgentHookEvent,
  HookHandlerSpec,
  HookRun,
  HookRunStatus,
} from '@harnesys/contracts';
export type {
  KnowledgeHit,
  MemoryRecord,
  MemoryRecordSource,
  PackAssignment,
  PackCatalogEntry,
  PackConfig,
  PackOverride,
  PinRecord,
  PinSource,
  SemanticScope,
  ToolCatalogEntry as ProjectTool,
} from 'harnesys';
export type { PermissionMode, ScheduleHistory } from 'harnesys/domain';
export { PERMISSION_MODES, SCHEDULE_HISTORIES } from 'harnesys/domain';
export type {
  AgentBudget,
  AgentGraph,
  AgentGraphLayout,
  AgentGraphPosition,
  AgentGraphRankdir,
  AgentRecord,
  BudgetPolicy,
} from './src/agent.ts';
export { defaultAgentCompaction } from './src/agent-runtime-defaults.ts';
export type { AgentCapabilitiesView, AgentCapabilityRegistryEntry } from './src/capabilities.ts';
export type {
  CapabilityMechanism,
  CatalogDriver,
  DiscoveredModel,
  DiscoveredModelView,
  Driver,
  DriverEndpoint,
  Effort,
  IncompleteField,
  Modality,
  ModelArchitecture,
  ModelFeature,
  ModelFields,
  ModelHints,
  ModelKind,
  ModelOrigin,
  ModelPricing,
  ModelPricingOverride,
  ModelRecord,
  ModelTopProvider,
  StudioCatalog,
  StudioModel,
  StudioModelView,
} from './src/catalog.ts';
export {
  DRIVERS,
  driverMechanism,
  EFFORTS,
  INCOMPLETE_FIELDS,
  isDriver,
  isEffort,
  isModelKind,
  isModelKindSupported,
  MODALITIES,
  MODEL_FEATURES,
  MODEL_KINDS,
  modelKindFromOutputModalities,
  SUPPORTED_MODEL_KINDS,
} from './src/catalog.ts';
export * from './src/desk-events.ts';
export * from './src/discovery.ts';
export * from './src/events-watch.ts';
export type {
  GitBranch,
  GitCheckoutRequest,
  GitCreateBranchRequest,
  GitDiffResponse,
  GitFileStatus,
  GitFileStatusMap,
  GitSourceSummary,
  GitStatusBase,
  GitStatusCounts,
  GitStatusResponse,
  GitSummaryCounts,
} from './src/git.ts';
export type {
  AgentGenerationSettings,
  AgentProjectPaths,
  PortRef,
  ToolOutputSettings,
} from './src/harnesys-bridge.ts';
export {
  DEFAULT_TOOL_OUTPUT_HEAD_CHARS,
  DEFAULT_TOOL_OUTPUT_MAX_CHARS,
  DEFAULT_TOOL_OUTPUT_TAIL_CHARS,
  filterGenerationSettings,
  programOf,
  segmentCommand,
  THRESHOLD_SUMMARY_NAME,
  withChatGenerationParameters,
} from './src/harnesys-bridge.ts';
export type {
  AskPayload,
  ConfirmPayload,
  HitlPayload,
  PermissionPayload,
} from './src/hitl-payload.ts';
export { payloadForSource } from './src/hitl-payload.ts';
export * from './src/issue.ts';
export * from './src/issue-prompt.ts';
export type {
  KnowledgeFileRecord,
  KnowledgeFileStatus,
  KnowledgeFilesByStatus,
  KnowledgeIndexState,
  KnowledgeIndexStatus,
  KnowledgeRootRecord,
  KnowledgeSettings,
  KnowledgeStats,
  MemorySearchBackend,
  UpsertKnowledgeRootRequest,
  UpsertKnowledgeSettingsRequest,
} from './src/knowledge.ts';
export type { AgentMode, ModeOp, ModeOpGate, ModeOpPermissions, ModePreset } from './src/modes.ts';
export {
  ASK_MODE,
  DEFAULT_MODE,
  DEFAULT_MODE_ID,
  effectiveMode,
  isModeId,
  MODE_ID_RE,
  MODE_OPS,
  modeFromPreset,
  PLAN_PACK_ID,
  resolveModeId,
} from './src/modes.ts';
export * from './src/org-machine.ts';
export * from './src/org-types.ts';
export * from './src/plan-types.ts';
export type {
  AddPluginRegistryRequest,
  ApprovePluginServerRequest,
  CatalogInstallSource,
  ComponentOrigin,
  ComponentSource,
  ComponentStatus,
  GrantClass,
  InstallPluginRequest,
  PluginCatalogEntry,
  PluginComponentSummary,
  PluginDiagnostic,
  PluginGrantSelection,
  PluginKind,
  PluginListItem,
  PluginMutationResponse,
  PluginName,
  PluginOptionValue,
  PluginRecord,
  PluginRegistryKind,
  PluginRegistrySummary,
  PluginSourceFormat,
  PluginSummary,
  RemovePluginRequest,
  SetPluginGrantsRequest,
  SetPluginOptionRequest,
} from './src/plugin.ts';
export type {
  CreateProjectSkillRequest,
  ProjectMcpConfigServer,
  ProjectMcpServer,
  ProjectMcpTransport,
  ProjectSkill,
  UpsertProjectMcpServerRequest,
} from './src/project-config.ts';
export * from './src/project-files.ts';
export * from './src/project-types.ts';
export type {
  ImportProvidersRequest,
  ImportProvidersSummary,
  ProviderExportBundle,
  ProviderExportEntry,
  ProviderExportModel,
  ProviderModelPublic,
  ProviderPublic,
  ProviderRecord,
} from './src/provider.ts';
export * from './src/schedule.ts';
export {
  isScheduledHumanText,
  SCHEDULE_HUMAN_ORIGIN,
  scheduledTaskName,
  scheduledTaskText,
  visibleScheduledText,
} from './src/schedule-prompt.ts';
export * from './src/semver.ts';
export type { TerminalSessionRecord } from './src/terminal.ts';
export { isTextAttachment } from './src/text-attachment.ts';
export type {
  AcceptedRunResponse,
  CompactThreadResponse,
  Event,
  RequestPlan,
  RequestSection,
  SessionEvent,
  SessionEventType,
  Snapshot,
  ThreadActiveRun,
  ThreadAgentRef,
  ThreadKind,
  ThreadLastError,
  ThreadRecord,
  ThreadSummary,
} from './src/thread.ts';
export { THREAD_KINDS, threadsForAgent } from './src/thread.ts';
export type { TranscriptItem } from './src/transcript.ts';
export { toTranscript } from './src/transcript.ts';
export { WEBHOOK_HUMAN_ORIGIN, webhookTaskText } from './src/webhook-prompt.ts';
export type {
  HostNetworkAddress,
  HostNetworkResponse,
  HostNodeStatus,
  IdeTabKind,
  PersistedIdeGroup,
  PersistedIdeTab,
  PersistedIdeWorkspace,
  ProjectRecord,
  WindowBootstrap,
  WindowBootstrapHost,
  WindowDesk,
  WindowDesksByOrg,
} from './src/window-desk.ts';
