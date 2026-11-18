import { agentsCatalogEntry } from './agents.ts';
import { approvalsCatalogEntry } from './approvals.ts';
import { automationsCatalogEntry } from './automations.ts';
import { dashboardsCatalogEntry } from './dashboards.ts';
import type { CatalogEntry } from './define.ts';
import { issuesCatalogEntry } from './issues.ts';
import { membersCatalogEntry } from './members.ts';
import { sourcesCatalogEntry } from './sources.ts';
import { terminalsCatalogEntry } from './terminals.ts';
import { threadsCatalogEntry } from './threads.ts';
import { usageCatalogEntry } from './usage.ts';
import { usageRunsCatalogEntry } from './usage-runs.ts';

export const CATALOG_ENTRIES: readonly CatalogEntry[] = [
  threadsCatalogEntry,
  approvalsCatalogEntry,
  agentsCatalogEntry,
  automationsCatalogEntry,
  issuesCatalogEntry,
  sourcesCatalogEntry,
  terminalsCatalogEntry,
  membersCatalogEntry,
  dashboardsCatalogEntry,
  usageCatalogEntry,
  usageRunsCatalogEntry,
];
