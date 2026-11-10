export {
  type AddonAccounts,
  type AddonBridge,
  type AddonConfig,
  type AddonContext,
  type AddonDb,
  type AddonEvents,
  type AddonHttp,
  type AddonLog,
  type AddonLogLevel,
  type AddonRuns,
  type AddonSecrets,
  type AddonThreads,
  type AddonTriggers,
  type AddonWorkers,
  createAddonContext,
  type DbRow,
  type DbStatement,
  type DbWriteResult,
  type SqlParam,
} from './addon-context-factory.ts';
export {
  type AddonDefinition,
  defineAddon,
  deriveHandlers,
  type HookHandler,
  type JobHandler,
  type LifecycleHandlers,
  type NotificationHandlers,
  type ResolvedAddonDefinition,
  type RouteHandler,
  type ToolHandler,
  type TransportHandlers,
  type TriggerPair,
  type WorkerPair,
} from './define-addon.ts';
export {
  CONFIG_SCHEMA_VERSION,
  type ConfigDescriptor,
  ConfigDescriptorSchema,
  configFamily,
} from './families/config.ts';
export {
  CONTENT_SCHEMA_VERSION,
  type ContentDescriptor,
  ContentDescriptorSchema,
  contentFamily,
} from './families/content.ts';
export {
  defaultConfigValues,
  type FieldOption,
  FieldOptionSchema,
  type FieldSpec,
  FieldSpecSchema,
  type FieldType,
  FieldTypeSchema,
  type FieldValue,
  FieldValueSchema,
} from './families/field-spec.ts';
export {
  HOOK_SCHEMA_VERSION,
  type HookDescriptor,
  HookDescriptorSchema,
  HookOnSchema,
  hookFamily,
} from './families/hook.ts';
export {
  JOB_SCHEMA_VERSION,
  type JobDescriptor,
  JobDescriptorSchema,
  JobScheduleSchema,
  jobFamily,
} from './families/job.ts';
export {
  INPUT_SCHEMA_MAX_BYTES,
  INPUT_SCHEMA_MAX_DEPTH,
  type JsonSchemaSubset,
  JsonSchemaSubsetSchema,
  type SchemaViolation,
  validateInputSchema,
} from './families/json-schema.ts';
export {
  LSP_SCHEMA_VERSION,
  type LspDescriptor,
  LspDescriptorSchema,
  lspFamily,
} from './families/lsp.ts';
export {
  MCP_SCHEMA_VERSION,
  type McpDescriptor,
  McpDescriptorSchema,
  mcpFamily,
} from './families/mcp.ts';
export {
  FAMILY_NAMES,
  type FamilyDefinition,
  familyDefinition,
  familyRegistry,
} from './families/registry.ts';
export {
  ROUTE_SCHEMA_VERSION,
  type RouteDescriptor,
  RouteDescriptorSchema,
  type RouteMethod,
  routeFamily,
} from './families/route.ts';
export {
  SOURCE_KIND_SCHEMA_VERSION,
  type SourceKindDescriptor,
  SourceKindDescriptorSchema,
  sourceKindFamily,
} from './families/source-kind.ts';
export {
  TOOL_PACK_SCHEMA_VERSION,
  type ToolDescriptor,
  ToolDescriptorSchema,
  type ToolEffect,
  type ToolPackDescriptor,
  ToolPackDescriptorSchema,
  toolPackFamily,
} from './families/tool-pack.ts';
export {
  TRANSPORT_SCHEMA_VERSION,
  type TransportCapabilities,
  TransportCapabilitiesSchema,
  type TransportDescriptor,
  TransportDescriptorSchema,
  transportFamily,
} from './families/transport.ts';
export {
  TRIGGER_SCHEMA_VERSION,
  type TriggerDescriptor,
  TriggerDescriptorSchema,
  type TriggerLimits,
  triggerFamily,
} from './families/trigger.ts';
export {
  type Action,
  ActionSchema,
  type Column,
  ColumnSchema,
  type RouteRef,
  RouteRefSchema,
  VIEW_SCHEMA_VERSION,
  type ViewDescriptor,
  ViewDescriptorSchema,
  type ViewSection,
  ViewSectionSchema,
  viewFamily,
} from './families/view.ts';
export {
  WORKER_SCHEMA_VERSION,
  type WorkerDescriptor,
  WorkerDescriptorSchema,
  workerFamily,
} from './families/worker.ts';
export { createHostClient, type HostChannel } from './host-client.ts';
export { type ConnectionRequirement, ConnectionRequirementSchema } from './manifest/connections.ts';
export { contributionDescriptorJsonSchema, manifestJsonSchema } from './manifest/json-schema.ts';
export { type L10n, L10nSchema, l10nKeys, resolveL10n } from './manifest/l10n.ts';
export {
  type AddonDataSpec,
  AddonDataSpecSchema,
  AddonIdSchema,
  type AddonManifest,
  AddonManifestSchema,
  type AddonRuntimeSpec,
  AddonRuntimeSpecSchema,
  type Contribution,
  ContributionIdSchema,
  ContributionSchema,
  parseAddonManifest,
} from './manifest/manifest.ts';
export { type ManifestValidation, type Violation, validateManifest } from './manifest/validate.ts';
export {
  BASELINE_PERMISSION_IDS,
  type BaselinePermissionId,
  type EffectivePermission,
  EffectivePermissionSchema,
  isBaselinePermissionId,
  isKnownPermissionId,
  type JsonObject,
  JsonObjectSchema,
  KNOWN_PERMISSION_IDS,
  type KnownPermissionId,
  type PermissionRequest,
  PermissionRequestSchema,
  type PermissionScope,
} from './permissions/permissions.ts';
export {
  createStdioChannel,
  PROTOCOL_PLATFORM,
  type StartAddonProcessOptions,
  type StdioWiring,
  startAddonProcess,
} from './process-entry.ts';
export {
  type CancelNotification,
  CancelNotificationSchema,
  decodeMessage,
  encodeMessage,
  errorResponse,
  JSONRPC_VERSION,
  type JsonRpcError,
  JsonRpcErrorSchema,
  JsonRpcIdSchema,
  type JsonRpcNotification,
  JsonRpcNotificationSchema,
  type JsonRpcRequest,
  JsonRpcRequestSchema,
  type JsonRpcResponse,
  JsonRpcResponseSchema,
  MAX_MESSAGE_BYTES,
  notification,
  type ProgressNotification,
  ProgressNotificationSchema,
  request,
  response,
} from './protocol/envelope.ts';
export {
  AddonError,
  type AddonErrorData,
  AddonErrorDataSchema,
  type AddonErrorReason,
  AddonErrorReasonSchema,
} from './protocol/error.ts';
export {
  type InitializeParams,
  InitializeParamsSchema,
  type InitializeResult,
  InitializeResultSchema,
} from './protocol/handshake.ts';
export {
  type AddonDispatcher,
  type AddonHandlerOf,
  type AddonNotify,
  type AddonToHostMethods,
  addonMethod,
  type HostNotify,
  type HostRequestName,
  type HostRequestParams,
  type HostRequestResult,
  type HostServiceClient,
  type HostServiceName,
  type HostServiceParams,
  type HostServiceResult,
  type HostToAddonMethods,
  hostMethod,
  type MethodDirection,
  type MethodSpec,
  type MethodsOf,
  methodSpec,
  type NotificationMethods,
  type NotificationName,
  type NotificationSender,
  notificationSpec,
  type ParamsOf,
  PROTOCOL_METHODS,
  type ProtocolEntry,
  type ProtocolMethodMap,
  protocolEntries,
  protocolMap,
  type ResultOf,
  stripMeta,
} from './protocol/map.ts';
export { type CallMeta, CallMetaSchema } from './protocol/meta.ts';
export {
  AccountSummarySchema,
  HttpAuthSchema,
  HttpFetchParamsSchema,
  HttpFetchResultSchema,
  InboundMessageSchema,
  type LogLevel,
  LogLevelSchema,
  LogWriteParamsSchema,
  type MessageFormat,
  type RouteHandleResult,
  RouteHandleResultSchema,
  type RouteRequest,
  RouteRequestSchema,
  type TransportAttachment,
  type TransportMessage,
  TransportMessageSchema,
  TriggerFireOutcomeSchema,
} from './protocol/shared.ts';
export { type AddonRuntime, type AddonRuntimeOptions, createAddonRuntime } from './runtime.ts';
export type {
  FakeAccount,
  FakeDb,
  FakeGrant,
  FakeHost,
  FakeHostOptions,
  FakeHttpHandler,
  FakeHttpRequest,
  FakeHttpResponse,
} from './testing/index.ts';
export { createFakeDb, createFakeHost, guardSql, SqlAuthorizerError } from './testing/index.ts';
