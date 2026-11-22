export { isDriver } from './src/adapters/models/binding.ts';
export type {
  AgentContextSettings,
  AgentGenerationSettings,
  GraphRoute,
} from './src/domain/agent-definition.ts';
export type {
  CompactionBudget,
  CompactionMessage,
  CompactionSizing,
  CompactionSizingSource,
  CompactionSpec,
  ParsedCompactionSpec,
} from './src/domain/compaction.ts';
export {
  DEFAULT_COMPACTION_FAILURE_LIMIT,
  DEFAULT_COMPACTION_MAX_CONTEXT_TOKENS,
  DEFAULT_COMPACTION_PRE_THRESHOLD_GAP_RATIO,
  DEFAULT_COMPACTION_PROTECT_TOKENS,
  DEFAULT_COMPACTION_RAPID_REFILL_MAX_COMPACTIONS,
  DEFAULT_COMPACTION_RAPID_REFILL_STEPS,
  isCompactionMessage,
  parseThresholdSpec,
  resolveCompactionBudget,
  resolveCompactionSizing,
  THRESHOLD_SUMMARY_NAME,
} from './src/domain/compaction.ts';
export type { CapabilityMechanism } from './src/domain/driver-capabilities.ts';
export { driverMechanism } from './src/domain/driver-capabilities.ts';
export {
  filterGenerationSettings,
  withChatGenerationParameters,
} from './src/domain/generation-settings.ts';
export type { HookEventName } from './src/domain/hook.ts';
export { NATIVE_HOOK_EVENTS } from './src/domain/hook.ts';
export type {
  HookEventCatalogEntry,
  HookEventPhase,
} from './src/domain/hook-catalog.ts';
export {
  HOOK_EVENT_CATALOG,
  hookCatalogEntry,
  hookMatcherApplies,
} from './src/domain/hook-catalog.ts';
export type {
  DroppedHook,
  HookGateStatus,
  HookPermission,
  ResolvedHookBindings,
} from './src/domain/hook-gate.ts';
export {
  hookGateStatus,
  hookIdOf,
  hookRequiredPermission,
  resolveHookBindings,
} from './src/domain/hook-gate.ts';
export type { PlanItemStatus, PlanStatus, SubagentRole } from './src/domain/plan.ts';
export { PLAN_ITEM_STATUSES, PLAN_STATUSES, SUBAGENT_ROLES } from './src/domain/plan.ts';
export type { PermissionMode } from './src/domain/schedule.ts';
export { PERMISSION_MODES } from './src/domain/schedule.ts';
export {
  DEFAULT_TOOL_OUTPUT_HEAD_CHARS,
  DEFAULT_TOOL_OUTPUT_MAX_CHARS,
  DEFAULT_TOOL_OUTPUT_TAIL_CHARS,
} from './src/domain/tool-output.ts';
export { programOf, segmentCommand } from './src/packs/shell/shell-chain.ts';
export type { Driver, ModelKind } from './src/ports/models.ts';
export {
  DEFAULT_SPEECH_SAMPLE_RATE,
  DEFAULT_SPEECH_VOICE_PARAM,
  DRIVERS,
  isModelKind,
  isModelKindSupported,
  MODEL_KINDS,
  modelKindFromOutputModalities,
  SPEECH_RESPONSE_FORMATS,
  SUPPORTED_MODEL_KINDS,
} from './src/ports/models.ts';
