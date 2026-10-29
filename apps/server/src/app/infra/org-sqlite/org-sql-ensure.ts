import {
  CREATE_AGENT_MEMORY_SQL,
  CREATE_AGENTS_SQL,
  CREATE_APPROVALS_SQL,
  CREATE_ATTACHMENTS_SQL,
  CREATE_BOARD_RULES_SQL,
  CREATE_BOARD_STATUSES_SQL,
  CREATE_EXECUTION_PROFILE_NODES_SQL,
  CREATE_EXECUTION_PROFILES_SQL,
  CREATE_ISSUE_ATTACHMENTS_SQL,
  CREATE_ISSUE_BOARDS_SQL,
  CREATE_ISSUE_COMMENTS_SQL,
  CREATE_ISSUE_DEPENDENCIES_SQL,
  CREATE_ISSUE_EXECUTIONS_SQL,
  CREATE_ISSUE_LABELS_SQL,
  CREATE_ISSUES_SQL,
  CREATE_KNOWLEDGE_SQL,
  CREATE_LLM_MODELS_SQL,
  CREATE_LLM_PROVIDERS_SQL,
  CREATE_MEMORY_CONSOLIDATIONS_SQL,
  CREATE_MEMORY_PROMOTIONS_SQL,
  CREATE_MEMORY_REFLECTS_SQL,
  CREATE_MODE_PRESETS_SQL,
  CREATE_NODES_SQL,
  CREATE_ORG_EXECUTION_SETTINGS_SQL,
  CREATE_ORG_MEMORY_SETTINGS_SQL,
  CREATE_ORGS_SQL,
  CREATE_PLUGINS_SQL,
  CREATE_RUN_EVENTS_SQL,
  CREATE_RUN_SNAPSHOTS_SQL,
  CREATE_RUNS_SQL,
  CREATE_SCHEDULES_SQL,
  CREATE_SECRETS_SQL,
  CREATE_THREAD_MESSAGE_QUEUE_SQL,
  CREATE_THREAD_PLANS_SQL,
  CREATE_THREADS_ISSUE_IDX_SQL,
  CREATE_THREADS_SQL,
  CREATE_USAGE_SQL,
  CREATE_WEBHOOKS_SQL,
  ensureKnowledgeFts,
  ensureSourcesSchema,
  migrateAgentsExecutionProfileColumn,
  migrateAgentsPolicyColumns,
  migrateApprovalsResumeStateColumn,
  migrateApprovalsTable,
  migrateExecutionProfileIsolation,
  migrateIssueExecutionCorrelationIndex,
  migrateNodesDockerColumn,
  migrateSourcesVcsColumns,
  migrateThreadPlansTable,
  migrateThreadsConnectorKind,
  migrateThreadsInheritedEventCount,
  migrateThreadsIssueKind,
  migrateUsageTable,
} from './org-sql.ts';
import { CREATE_CONNECTORS_SQL } from './org-sql-connectors.ts';
import { CREATE_FILE_ACCESS_RULES_SQL } from './org-sql-file-access.ts';
import {
  CREATE_INVITES_INDEX_SQL,
  CREATE_INVITES_SQL,
  ensureFleetSchema,
  migrateInvitesCodeHash,
  migratePendingRunEventsAttributionColumns,
} from './org-sql-fleet.ts';
import { CREATE_HOOK_RUNS_SQL } from './org-sql-hooks.ts';
import {
  CREATE_INTEGRATION_EVENTS_DELIVERY_IDX_SQL,
  CREATE_INTEGRATION_EVENTS_SQL,
} from './org-sql-integration-events.ts';
import {
  CREATE_INTEGRATION_OAUTH_SESSIONS_IDX_SQL,
  CREATE_INTEGRATION_OAUTH_SESSIONS_SQL,
} from './org-sql-integration-sessions.ts';
import {
  backfillIntegrationsFromSources,
  CREATE_INTEGRATIONS_SQL,
} from './org-sql-integrations.ts';

interface ColumnInfo {
  name: string;
}

function migrateThreadsBindingColumns(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const present = new Set(all('PRAGMA table_info(threads)').map((col) => col.name));
  const columns = [
    { name: 'run_profile_id', ddl: 'TEXT' },
    { name: 'run_directory', ddl: 'TEXT' },
  ];
  for (const column of columns) {
    if (!present.has(column.name)) {
      exec(`ALTER TABLE threads ADD COLUMN ${column.name} ${column.ddl}`);
    }
  }
}

function migrateRunsAttributionColumns(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const present = new Set(all('PRAGMA table_info(runs)').map((col) => col.name));
  const columns = [
    { name: 'started_by_user_id', ddl: 'TEXT' },
    { name: 'via', ddl: `TEXT NOT NULL DEFAULT 'direct'` },
    { name: 'on_node_id', ddl: 'TEXT' },
  ];
  for (const column of columns) {
    if (!present.has(column.name)) {
      exec(`ALTER TABLE runs ADD COLUMN ${column.name} ${column.ddl}`);
    }
  }
}

export function migrateAgentMemoryConsolidationColumns(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const present = new Set(all('PRAGMA table_info(memory_facts)').map((col) => col.name));
  const columns = [
    { name: 'importance', ddl: 'INTEGER NOT NULL DEFAULT 5' },
    { name: 'last_accessed_at', ddl: 'TEXT' },
    { name: 'access_count', ddl: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'superseded_by', ddl: 'TEXT' },
  ];
  for (const column of columns) {
    if (!present.has(column.name)) {
      exec(`ALTER TABLE memory_facts ADD COLUMN ${column.name} ${column.ddl}`);
    }
  }
}

export function migrateAgentMemoryEmbeddingColumns(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const present = new Set(all('PRAGMA table_info(memory_facts)').map((col) => col.name));
  const columns = [
    { name: 'embedding', ddl: 'BLOB' },
    { name: 'embedding_model', ddl: 'TEXT' },
  ];
  for (const column of columns) {
    if (!present.has(column.name)) {
      exec(`ALTER TABLE memory_facts ADD COLUMN ${column.name} ${column.ddl}`);
    }
  }
}

export function migrateOrgMemorySettingsModelColumns(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const present = new Set(all('PRAGMA table_info(org_memory_settings)').map((col) => col.name));
  if (present.size === 0) {
    return;
  }
  if (!present.has('embed_model_id')) {
    exec('ALTER TABLE org_memory_settings ADD COLUMN embed_model_id TEXT');
  }
  if (!present.has('decision_model_id')) {
    exec('ALTER TABLE org_memory_settings ADD COLUMN decision_model_id TEXT');
  }
  if (!present.has('embed_provider')) {
    return;
  }
  exec(`UPDATE org_memory_settings SET embed_model_id = (
    SELECT m.id
    FROM llm_models m
    JOIN llm_providers p ON p.id = m.provider_id
    WHERE m.name = org_memory_settings.embed_model
      AND p.name = org_memory_settings.embed_provider
    LIMIT 1
  )`);
  exec('ALTER TABLE org_memory_settings DROP COLUMN embed_provider');
  exec('ALTER TABLE org_memory_settings DROP COLUMN embed_model');
}

function migrateModePresetToolColumns(
  exec: (sql: string) => void,
  all?: (sql: string) => ColumnInfo[],
): void {
  if (!all) {
    return;
  }
  const present = new Set(all('PRAGMA table_info(mode_presets)').map((col) => col.name));
  if (present.size === 0) {
    return;
  }
  const columns = [
    { name: 'disabled_tools_json', ddl: `TEXT NOT NULL DEFAULT '[]'` },
    { name: 'exposure_json', ddl: `TEXT NOT NULL DEFAULT '{}'` },
  ];
  for (const column of columns) {
    if (!present.has(column.name)) {
      exec(`ALTER TABLE mode_presets ADD COLUMN ${column.name} ${column.ddl}`);
    }
  }
}

function migrateTriggerOwnerColumns(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  for (const table of ['schedules', 'webhooks']) {
    const present = new Set(all(`PRAGMA table_info(${table})`).map((col) => col.name));
    if (present.size > 0 && !present.has('created_by_user_id')) {
      exec(`ALTER TABLE ${table} ADD COLUMN created_by_user_id TEXT`);
    }
  }
}

function assertIssuesStatusKey(all?: (sql: string) => ColumnInfo[]): void {
  if (!all) {
    return;
  }
  const columns = new Set(all('PRAGMA table_info(issues)').map((column) => column.name));
  if (columns.size === 0 || columns.has('status_key')) {
    return;
  }
  throw new Error(
    'Legacy org database detected: table "issues" has no "status_key" column. Delete the org database and restart so the schema is recreated.',
  );
}

function migrateIssuesBranchColumns(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const present = new Set(all('PRAGMA table_info(issues)').map((col) => col.name));
  if (present.size === 0) {
    return;
  }
  const columns = [
    { name: 'branch', ddl: 'TEXT' },
    { name: 'worktree_on_status', ddl: 'TEXT' },
  ];
  for (const column of columns) {
    if (!present.has(column.name)) {
      exec(`ALTER TABLE issues ADD COLUMN ${column.name} ${column.ddl}`);
    }
  }
}

export function ensureOrgSchema(
  exec: (sql: string) => void,
  all?: (sql: string) => ColumnInfo[],
): number {
  exec(CREATE_ORGS_SQL);
  exec(CREATE_NODES_SQL);
  migrateNodesDockerColumn(exec, all);
  exec(CREATE_INVITES_SQL);
  if (all) {
    migrateInvitesCodeHash(exec, all);
  }
  exec(CREATE_INVITES_INDEX_SQL);
  exec(CREATE_SECRETS_SQL);
  const worktreeBranchDupes = ensureSourcesSchema(exec, all);
  migrateSourcesVcsColumns(exec, all);
  exec(CREATE_INTEGRATIONS_SQL);
  backfillIntegrationsFromSources(exec, all);
  exec(CREATE_INTEGRATION_EVENTS_SQL);
  exec(CREATE_INTEGRATION_EVENTS_DELIVERY_IDX_SQL);
  exec(CREATE_INTEGRATION_OAUTH_SESSIONS_SQL);
  exec(CREATE_INTEGRATION_OAUTH_SESSIONS_IDX_SQL);
  exec(CREATE_LLM_PROVIDERS_SQL);
  exec(CREATE_LLM_MODELS_SQL);
  exec(CREATE_AGENTS_SQL);
  exec(CREATE_HOOK_RUNS_SQL);
  migrateAgentsPolicyColumns(exec, all);
  migrateAgentsExecutionProfileColumn(exec, all);
  exec(CREATE_MODE_PRESETS_SQL);
  migrateModePresetToolColumns(exec, all);
  exec(CREATE_PLUGINS_SQL);
  exec(CREATE_KNOWLEDGE_SQL);
  ensureKnowledgeFts(exec);
  exec(CREATE_THREADS_SQL);
  migrateThreadsIssueKind(exec, all);
  migrateThreadsConnectorKind(exec, all);
  migrateThreadsInheritedEventCount(exec, all);
  if (all) {
    migrateThreadsBindingColumns(exec, all);
  }
  exec(CREATE_THREADS_ISSUE_IDX_SQL);
  exec(CREATE_ISSUE_BOARDS_SQL);
  exec(CREATE_BOARD_STATUSES_SQL);
  exec(CREATE_BOARD_RULES_SQL);
  exec(CREATE_ISSUE_LABELS_SQL);
  exec(CREATE_ISSUES_SQL);
  assertIssuesStatusKey(all);
  if (all) {
    migrateIssuesBranchColumns(exec, all);
  }
  exec(CREATE_ISSUE_COMMENTS_SQL);
  exec(CREATE_ISSUE_DEPENDENCIES_SQL);
  exec(CREATE_ISSUE_ATTACHMENTS_SQL);
  exec(CREATE_ISSUE_EXECUTIONS_SQL);
  if (all) {
    migrateIssueExecutionCorrelationIndex(exec, all);
  }
  exec(CREATE_RUNS_SQL);
  if (all) {
    migrateRunsAttributionColumns(exec, all);
  }
  exec(CREATE_RUN_EVENTS_SQL);
  exec(CREATE_RUN_SNAPSHOTS_SQL);
  exec(CREATE_ATTACHMENTS_SQL);
  exec(CREATE_THREAD_MESSAGE_QUEUE_SQL);
  exec(CREATE_APPROVALS_SQL);
  if (all) {
    migrateApprovalsTable(exec, all);
    migrateApprovalsResumeStateColumn(exec, all);
  }
  exec(CREATE_FILE_ACCESS_RULES_SQL);
  exec(CREATE_SCHEDULES_SQL);
  exec(CREATE_WEBHOOKS_SQL);
  if (all) {
    migrateTriggerOwnerColumns(exec, all);
  }
  exec(CREATE_CONNECTORS_SQL);
  exec(CREATE_THREAD_PLANS_SQL);
  if (all) {
    migrateThreadPlansTable(exec, all);
  }
  exec(CREATE_AGENT_MEMORY_SQL);
  exec(CREATE_MEMORY_CONSOLIDATIONS_SQL);
  exec(CREATE_MEMORY_REFLECTS_SQL);
  exec(CREATE_MEMORY_PROMOTIONS_SQL);
  if (all) {
    migrateAgentMemoryConsolidationColumns(exec, all);
    migrateAgentMemoryEmbeddingColumns(exec, all);
  }
  exec(CREATE_USAGE_SQL);
  if (all) {
    migrateUsageTable(exec, all);
  }
  exec(CREATE_EXECUTION_PROFILES_SQL);
  migrateExecutionProfileIsolation(exec, all);
  exec(CREATE_EXECUTION_PROFILE_NODES_SQL);
  exec(CREATE_ORG_EXECUTION_SETTINGS_SQL);
  exec(CREATE_ORG_MEMORY_SETTINGS_SQL);
  if (all) {
    migrateOrgMemorySettingsModelColumns(exec, all);
  }
  ensureFleetSchema(exec);
  migratePendingRunEventsAttributionColumns(exec, all);
  return worktreeBranchDupes;
}
