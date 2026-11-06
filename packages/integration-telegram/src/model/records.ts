export type ReaderStatus =
  | 'anonymous'
  | 'awaiting_code'
  | 'awaiting_password'
  | 'authorized'
  | 'error';
export type PeerKind = 'channel' | 'group' | 'supergroup';
export type RuleStatus = 'active' | 'paused' | 'failed';
export type PostOutcome = 'new' | 'filtered' | 'fired' | 'throttled' | 'over_limit' | 'error';

export interface KeywordsStage {
  type: 'keywords';
  config: { terms: string[]; match: 'any' | 'all'; exclude: string[] };
}
export type FilterStage = KeywordsStage;

export interface ReaderRecord {
  id: string;
  label: string;
  status: ReaderStatus;
  apiId: number;
  phoneMasked: string;
  dcId: number | null;
  lastError: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SourceRecord {
  id: string;
  readerId: string;
  peerKind: PeerKind;
  peerId: string;
  accessHash: string;
  username: string | null;
  title: string;
  joined: boolean;
  watchTopics: boolean;
  lastPostId: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RuleRecord {
  id: string;
  name: string;
  status: RuleStatus;
  agentId: string;
  threadId: string;
  modeId: string;
  detail: string;
  filter: FilterStage[];
  history: 'none' | 'last';
  historyLast: number;
  maxRunsPerDay: number;
  throttleSec: number;
  runsDate: string;
  runsToday: number;
  lastFiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostRecord {
  id: string;
  sourceId: string;
  postId: number;
  topicId: number | null;
  authorTitle: string | null;
  text: string;
  mediaKinds: string[];
  publishedAt: string;
  receivedAt: string;
  outcome: PostOutcome;
  fireCount: number;
}

export function runsDate(iso: string): string {
  return iso.slice(0, 10);
}

export function isRuleThrottled(rule: RuleRecord, nowIso: string): boolean {
  if (rule.throttleSec <= 0 || rule.lastFiredAt === null) {
    return false;
  }
  return Date.parse(nowIso) - Date.parse(rule.lastFiredAt) < rule.throttleSec * 1000;
}

export function isRuleOverCap(rule: RuleRecord, nowIso: string): boolean {
  if (rule.runsDate !== runsDate(nowIso)) {
    return false;
  }
  return rule.runsToday >= rule.maxRunsPerDay;
}
