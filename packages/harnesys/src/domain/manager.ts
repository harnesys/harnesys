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
  /** Usage rows with no price match: their cost is missing from costUsd, not free. */
  unpriced: number;
  /** Usage rows matched to a confirmed zero rate (free tier, local, subscription): $0 is real spend. */
  zeroPriced: number;
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
