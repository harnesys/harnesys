import type { PortRef } from '@harnesys/studio-shared';
import { THRESHOLD_SUMMARY_NAME } from '@harnesys/studio-shared';
export interface CompactionDraft {
  thresholdRatio: string;
  protectRecentRatio: string;
  preCompactNote: boolean;
  auto: boolean;
  summaryProvider: string;
  summaryModel: string;
}
export function compactionDraftFrom(ref: PortRef | null): CompactionDraft {
  if (!ref) {
    return {
      thresholdRatio: '0.8',
      protectRecentRatio: '0.1',
      preCompactNote: true,
      auto: true,
      summaryProvider: '',
      summaryModel: '',
    };
  }
  const spec = ref.spec ?? {};
  const summary = summaryModelFrom(spec.summaryModel);
  return {
    thresholdRatio: stringifyNumber(spec.thresholdRatio, '0.8'),
    protectRecentRatio: stringifyNumber(spec.protectRecentRatio, '0.1'),
    preCompactNote: spec.preCompactNote !== false,
    auto: spec.auto !== false,
    summaryProvider: summary.provider,
    summaryModel: summary.model,
  };
}
export function toCompactionPortRef(draft: CompactionDraft): PortRef {
  const spec: Record<string, unknown> = {
    thresholdRatio: parseRatio(draft.thresholdRatio, 0.8),
    protectRecentRatio: parseRatio(draft.protectRecentRatio, 0.1),
    preCompactNote: draft.preCompactNote,
    auto: draft.auto,
  };
  const provider = draft.summaryProvider.trim();
  const model = draft.summaryModel.trim();
  if (provider && model) {
    spec.summaryModel = { provider, model };
  }
  return { name: THRESHOLD_SUMMARY_NAME, spec };
}
function summaryModelFrom(value: unknown): {
  provider: string;
  model: string;
} {
  if (typeof value !== 'object' || value === null) {
    return { provider: '', model: '' };
  }
  const record = value as {
    provider?: unknown;
    model?: unknown;
  };
  return {
    provider: typeof record.provider === 'string' ? record.provider : '',
    model: typeof record.model === 'string' ? record.model : '',
  };
}
function stringifyNumber(value: unknown, fallback: string): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : fallback;
}
function parseRatio(value: string, fallback: number): number {
  const next = Number(value.trim());
  return Number.isFinite(next) ? next : fallback;
}
