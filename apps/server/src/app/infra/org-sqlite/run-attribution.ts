import type { RunAttribution, RunVia } from 'harnesys';

export interface RunAttributionColumns {
  startedByUserId: string | null;
  via: string;
  onNodeId: string | null;
}

export interface RunAttributionRow {
  startedByUserId: string | null;
  via: string | null;
  onNodeId: string | null;
}

export function runAttributionValues(
  attribution: RunAttribution | undefined,
): Partial<RunAttributionColumns> {
  if (!attribution) {
    return {};
  }
  return {
    startedByUserId: attribution.startedByUserId ?? null,
    via: attribution.via,
    onNodeId: attribution.onNodeId ?? null,
  };
}

export function runAttributionOf(row: RunAttributionRow): RunAttribution {
  return {
    startedByUserId: row.startedByUserId ?? undefined,
    via: (row.via ?? 'direct') as RunVia,
    onNodeId: row.onNodeId,
  };
}
