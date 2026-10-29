import type { NodePlacement } from 'harnesys';

export type { NodePlacement };

export type OrgId = string;
export type NodeId = string;
export type AgentId = string;
export type ProjectId = string;

export interface OrgRecord {
  id: OrgId;
  name: string;
  createdAt: string;
}

export interface NodeRecord {
  id: NodeId;
  name: string;
  role: 'relay' | 'worker' | 'solo';
  tags: string[];
  lastSeenAt: string | null;
  status: 'online' | 'offline' | 'draining';
  drainingSince: string | null;
  enrolledAt: string;
}

export interface ProjectRegistryRecord {
  id: ProjectId;
  orgId: OrgId;
  name: string;
  path: string;
  nodeId: NodeId;
  legacyHostId: string | null;
  createdAt: string;
}

export interface AssignmentRecord {
  id: string;
  agentId: AgentId;
  projectId: ProjectId;
  enabled: boolean;
  createdAt: string;
}

export type AgentLevel = 'top' | 'delegate';

export interface AgentConfig {
  graphJson?: unknown;
  budgetJson?: unknown;
  skills?: string[];
  modesJson?: unknown;
  mcpServers?: unknown;
  capabilitiesJson?: unknown;
  permissionsJson?: Record<string, 'allow' | 'ask' | 'deny'>;
  hooksJson?: unknown;
  enabledPluginsJson?: unknown;
  effort?: string;
  generation?: unknown;
  toolOutput?: unknown;
  compactionJson?: unknown;
  memoryJson?: unknown;
  defaultModeId?: string;
  color?: string;
  [key: string]: unknown;
}

export interface AgentOrgRecord {
  id: AgentId;
  orgId: OrgId;
  name: string;
  role: string;
  instructions: string;
  model: string;
  config: AgentConfig;
  level: AgentLevel;
  parentId: AgentId | null;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export type OrgEventType =
  | 'ORG_BOOTSTRAPPED'
  | 'AGENT_CREATED'
  | 'AGENT_UPDATED'
  | 'AGENT_ARCHIVED'
  | 'ASSIGNMENT_GRANTED'
  | 'ASSIGNMENT_REVOKED'
  | 'PROJECT_REGISTERED'
  | 'PROJECT_UNREGISTERED'
  | 'NODE_ENROLLED'
  | 'NODE_STATUS'
  | 'INVITE_ISSUED'
  | 'INVITE_REVOKED'
  | 'INVITE_CONSUMED'
  | 'RUN_STARTED'
  | 'RUN_COMPLETED'
  | 'RUN_FAILED'
  | 'RUN_DEAD_LETTERED'
  | 'APPROVAL_REQUESTED'
  | 'APPROVAL_DECIDED'
  | 'APPROVAL_EXPIRED'
  | 'BUDGET_THRESHOLD'
  | 'USAGE_RECORDED'
  | 'SCHEDULE_UPSERTED'
  | 'SCHEDULE_DELETED'
  | 'SCHEDULE_DUE'
  | 'SCHEDULE_MISSED'
  | 'WORK_ISSUED'
  | 'WORK_COMPLETED'
  | 'WORK_FAILED'
  | 'EVAL_RUN_STARTED'
  | 'EVAL_RUN_FINISHED'
  | 'MEMORY_WRITTEN';

export interface OrgEventRecord {
  sequence: number;
  id: string;
  ts: string;
  type: OrgEventType;
  payload: unknown;
  causationId: string | null;
  correlationId: string;
  nodeId: NodeId;
}

export type ApprovalOption = 'approve' | 'approve_once' | 'deny' | 'block_path' | 'close';
export type ApprovalKind = 'tool' | 'spend' | 'memory' | 'question' | 'file_access';
export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'cancelled' | 'superseded';
export type ApprovalSurface = 'web' | 'telegram' | 'push' | 'system';

export interface UsageRecord {
  id: string;
  ts: string;
  projectId: ProjectId | null;
  agentId: AgentId | null;
  runId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  costUsd: number;
  pricingSource: 'provider' | 'manual' | 'catalog' | 'none';
}

export interface ScheduleProjectionRecord {
  id: string;
  projectId: string;
  agentId: string;
  prompt: string;
  cron: string;
  tz: string;
  enabled: boolean;
  nextDueAt: string | null;
}
