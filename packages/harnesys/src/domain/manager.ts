import type { AgentLevel } from '@harnesys/contracts';

export interface ManagerPulseAgent {
  agentId: string;
  name: string;
  role: string;
  spentUsdToday: number;
  budgetUsdDaily: number | null;
  budgetPercent: number | null;
}
export interface ManagerPulseThread {
  threadId: string;
  title: string;
  agentId: string;
  agentName: string | null;
  kind: string;
  lastError: string | null;
  updatedAt: string;
}
export interface ManagerPulse {
  agents: ManagerPulseAgent[];
  failedThreads: ManagerPulseThread[];
  pendingApprovals: number;
  openIssues: number;
  spendUsdToday: number;
}
export interface ManagerUsageRow {
  key: string | null;
  /** Display name resolved for groupBy=agent; null when the agent row is gone (deleted). */
  name?: string | null;
  level?: AgentLevel;
  /** Usage rows counted with pricingSource 'none': costUsd 0 may mean free or unpriced. */
  unpriced: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  runs: number;
}
export interface ManagerUsageReport {
  rows: ManagerUsageRow[];
  totalCostUsd: number;
  totalRuns: number;
}
export interface ManagerThreadTailItem {
  seq: number;
  runId: string;
  kind: string;
  at: string | null;
  preview: string | null;
}
