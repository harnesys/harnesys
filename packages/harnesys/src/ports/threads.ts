import type { ManagerThreadTailItem } from '../domain/manager.ts';
import type { CapabilityScope } from '../domain/pack.ts';

export interface ThreadSummary {
  id: string;
  title: string;
  kind: string;
  agentId: string;
  agentName: string;
  hasSchedule: boolean;
}

export interface ThreadHistoryQuery {
  threadId?: string;
  beforeSeq?: number;
  limit?: number;
}

export type ThreadSearchScope = 'thread' | 'org';

export interface ThreadHistoryMessage {
  threadId: string;
  threadSeq: number;
  role: 'user' | 'assistant';
  author?: string;
  text: string;
}

export interface ThreadHistoryPage {
  messages: ThreadHistoryMessage[];
  hasMore: boolean;
  oldestSeq: number | null;
}

export interface ThreadSearchQuery {
  query: string;
  scope?: ThreadSearchScope;
  threadId?: string;
  limit?: number;
}

export interface ThreadSearchResult {
  hits: ThreadHistoryMessage[];
  hasMore: boolean;
}

export interface ThreadsPort {
  list(scope: CapabilityScope): Promise<ThreadSummary[]>;
  history(scope: CapabilityScope, query: ThreadHistoryQuery): Promise<ThreadHistoryPage>;
  search(scope: CapabilityScope, query: ThreadSearchQuery): Promise<ThreadSearchResult>;
  tail(scope: CapabilityScope, threadId: string, limit: number): Promise<ManagerThreadTailItem[]>;
}
