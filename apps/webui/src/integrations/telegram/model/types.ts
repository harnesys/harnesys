export type TelegramPeerKind = 'channel' | 'group' | 'supergroup';

export type TelegramRuleStatus = 'active' | 'paused' | 'failed';

export type TelegramFeedHistory = 'none' | 'last';

export type TelegramPostOutcome =
  | 'new'
  | 'filtered'
  | 'fired'
  | 'throttled'
  | 'over_limit'
  | 'error';

export type TelegramKeywordMatch = 'any' | 'all';

export interface TelegramKeywordsStage {
  type: 'keywords';
  config: { terms: string[]; match: TelegramKeywordMatch; exclude: string[] };
}

export interface TelegramSource {
  id: string;
  readerId: string;
  peerKind: TelegramPeerKind;
  peerId: string;
  username: string | null;
  title: string;
  joined: boolean;
  watchTopics: boolean;
  lastPostId: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TelegramPost {
  id: string;
  sourceId: string;
  sourceTitle: string;
  postId: number;
  topicId: number | null;
  authorTitle: string | null;
  text: string;
  url: string | null;
  mediaKinds: string[];
  publishedAt: string;
  receivedAt: string;
  outcome: TelegramPostOutcome;
  fireCount: number;
}

export interface TelegramRule {
  id: string;
  name: string;
  status: TelegramRuleStatus;
  agentId: string;
  threadId: string;
  modeId: string;
  detail: string;
  sourceIds: string[];
  filter: TelegramKeywordsStage[];
  history: TelegramFeedHistory;
  historyLast: number;
  maxRunsPerDay: number;
  throttleSec: number;
  runsToday: number;
  lastFiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListPostsQuery {
  sourceId?: string;
  outcome?: TelegramPostOutcome;
  limit?: number;
}

export interface RuleBody {
  name: string;
  agentId: string;
  threadId?: string;
  modeId?: string;
  detail?: string;
  sourceIds: string[];
  filter: TelegramKeywordsStage[];
  history: TelegramFeedHistory;
  historyLast: number;
  maxRunsPerDay: number;
  throttleSec: number;
  status?: TelegramRuleStatus;
}
