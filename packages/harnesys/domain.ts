export { isDriver } from './src/adapters/models/binding.ts';
export type { AgentGenerationSettings } from './src/domain/agent-definition.ts';
export type {
  CompactionMessage,
  CompactionSpec,
  ParsedCompactionSpec,
} from './src/domain/compaction.ts';
export {
  isCompactionMessage,
  parseThresholdSpec,
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
export type { PermissionMode, ScheduleHistory } from './src/domain/schedule.ts';
export { PERMISSION_MODES, SCHEDULE_HISTORIES } from './src/domain/schedule.ts';
export {
  DEFAULT_TOOL_OUTPUT_HEAD_CHARS,
  DEFAULT_TOOL_OUTPUT_MAX_CHARS,
  DEFAULT_TOOL_OUTPUT_TAIL_CHARS,
} from './src/domain/tool-output.ts';
export { programOf, segmentCommand } from './src/packs/shell/shell-chain.ts';
export type { Driver, ModelKind } from './src/ports/models.ts';
export {
  DRIVERS,
  isModelKind,
  isModelKindSupported,
  MODEL_KINDS,
  modelKindFromOutputModalities,
  SUPPORTED_MODEL_KINDS,
} from './src/ports/models.ts';
