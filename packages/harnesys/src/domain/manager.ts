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
