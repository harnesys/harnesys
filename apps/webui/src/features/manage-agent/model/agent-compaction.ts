import type { PortRef } from '@harnesys/studio-shared';
import { THRESHOLD_SUMMARY_NAME } from '@harnesys/studio-shared';
export interface CompactionDraft {
  thresholdRatio: string;
  protectRecentRatio: string;
  preCompactNote: boolean;
  auto: boolean;
  summaryProvider: string;
  summaryModel: string;
  microcompact: boolean;
  microcompactKeepRounds: string;
  microcompactStepRounds: string;
  microcompactMinGainTokens: string;
  compactionFailureLimit: string;
  compactionRapidRefillSteps: string;
  overflowCompaction: boolean;
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
      microcompact: false,
      microcompactKeepRounds: '5',
      microcompactStepRounds: '',
      microcompactMinGainTokens: '256',
      compactionFailureLimit: '3',
      compactionRapidRefillSteps: '3',
      overflowCompaction: true,
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
    microcompact: spec.microcompact === true,
    microcompactKeepRounds: stringifyNumber(spec.microcompactKeepRounds, '5'),
    microcompactStepRounds: stringifyNumber(spec.microcompactStepRounds, ''),
    microcompactMinGainTokens: stringifyNumber(spec.microcompactMinGainTokens, '256'),
    compactionFailureLimit: stringifyNumber(spec.compactionFailureLimit, '3'),
    compactionRapidRefillSteps: stringifyNumber(spec.compactionRapidRefillSteps, '3'),
    overflowCompaction: spec.overflowCompaction !== false,
  };
}
export function toCompactionPortRef(draft: CompactionDraft): PortRef {
  const spec: Record<string, unknown> = {
    thresholdRatio: parseRatio(draft.thresholdRatio, 0.8),
    protectRecentRatio: parseRatio(draft.protectRecentRatio, 0.1),
    preCompactNote: draft.preCompactNote,
    auto: draft.auto,
    microcompact: draft.microcompact,
    microcompactKeepRounds: parsePositiveInt(draft.microcompactKeepRounds, 5),
    microcompactStepRounds: parseOptionalPositiveInt(draft.microcompactStepRounds),
    microcompactMinGainTokens: parseNonNegativeInt(draft.microcompactMinGainTokens, 256),
    compactionFailureLimit: parseNonNegativeInt(draft.compactionFailureLimit, 3),
    compactionRapidRefillSteps: parseNonNegativeInt(draft.compactionRapidRefillSteps, 3),
    overflowCompaction: draft.overflowCompaction,
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
function parseNonNegativeInt(value: string, fallback: number): number {
  const next = Number(value.trim());
  return Number.isFinite(next) && next >= 0 ? Math.floor(next) : fallback;
}
function parsePositiveInt(value: string, fallback: number): number {
  const next = parseNonNegativeInt(value, fallback);
  return Math.max(1, next);
}
function parseOptionalPositiveInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const next = Number(trimmed);
  return Number.isFinite(next) && next >= 1 ? Math.floor(next) : undefined;
}
