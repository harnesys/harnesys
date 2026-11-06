import { DEFAULT_MODE_ID } from '@harnesys/studio-shared';
import type { Agent } from '@/entities/agent';
import type { ClientAutomation } from '@/entities/automation';
import type {
  RuleBody,
  TelegramFeedHistory,
  TelegramKeywordMatch,
  TelegramKeywordsStage,
  TelegramRule,
  TelegramRuleStatus,
} from './types';

export interface TelegramFeedDialogData {
  orgId: string;
  agents: Agent[];
  automation: ClientAutomation | null;
}

export type TelegramFeedDialogResult = { deleted: true } | { deleted: false };

export type TelegramFeedOnResolve = (value?: TelegramFeedDialogResult) => void;

export interface TelegramFeedDraft {
  name: string;
  agentId: string;
  threadId: string;
  modeId: string;
  detail: string;
  sourceIds: string[];
  terms: string[];
  match: TelegramKeywordMatch;
  exclude: string[];
  history: TelegramFeedHistory;
  historyLast: number;
  maxRunsPerDay: number;
  throttleSec: number;
  status: TelegramRuleStatus;
}

export function emptyFeedDraft(agents: Agent[]): TelegramFeedDraft {
  const first = agents[0];
  return {
    name: '',
    agentId: first?.id ?? '',
    threadId: '',
    modeId: first?.defaultModeId ?? DEFAULT_MODE_ID,
    detail: '',
    sourceIds: [],
    terms: [],
    match: 'any',
    exclude: [],
    history: 'none',
    historyLast: 20,
    maxRunsPerDay: 50,
    throttleSec: 0,
    status: 'active',
  };
}

export function feedDraftFromRule(rule: TelegramRule): TelegramFeedDraft {
  const stage = rule.filter.find((item): item is TelegramKeywordsStage => item.type === 'keywords');
  return {
    name: rule.name,
    agentId: rule.agentId,
    threadId: rule.threadId,
    modeId: rule.modeId,
    detail: rule.detail,
    sourceIds: [...rule.sourceIds],
    terms: [...(stage?.config.terms ?? [])],
    match: stage?.config.match ?? 'any',
    exclude: [...(stage?.config.exclude ?? [])],
    history: rule.history,
    historyLast: rule.historyLast,
    maxRunsPerDay: rule.maxRunsPerDay,
    throttleSec: rule.throttleSec,
    status: rule.status,
  };
}

export function ruleBodyFromDraft(draft: TelegramFeedDraft): RuleBody {
  const hasKeywords = draft.terms.length > 0 || draft.exclude.length > 0;
  const stage: TelegramKeywordsStage = {
    type: 'keywords',
    config: { terms: draft.terms, match: draft.match, exclude: draft.exclude },
  };
  return {
    name: draft.name.trim(),
    agentId: draft.agentId,
    ...(draft.threadId ? { threadId: draft.threadId } : {}),
    modeId: draft.modeId,
    ...(draft.detail.trim() ? { detail: draft.detail.trim() } : {}),
    sourceIds: draft.sourceIds,
    filter: hasKeywords ? [stage] : [],
    history: draft.history,
    historyLast: draft.historyLast,
    maxRunsPerDay: draft.maxRunsPerDay,
    throttleSec: draft.throttleSec,
    status: draft.status,
  };
}
