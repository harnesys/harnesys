import { apiJson } from '@/shared/api/client';
import type {
  AddSourceBody,
  AuthorizeReaderBody,
  BackfillResult,
  CreateReaderBody,
  ListPostsQuery,
  RuleBody,
  TelegramPost,
  TelegramReader,
  TelegramRule,
  TelegramSource,
} from './model/types';

interface ReaderResponse {
  reader: TelegramReader;
}
interface AuthorizeReaderResponse {
  reader: TelegramReader | null;
}
interface ItemsResponse<T> {
  items: T[];
}
interface SourceResponse {
  source: TelegramSource;
}
interface RuleResponse {
  rule: TelegramRule;
}

function telegramBase(orgId: string): string {
  return `/api/orgs/${encodeURIComponent(orgId)}/integrations/telegram`;
}

export function listReaders(orgId: string): Promise<TelegramReader[]> {
  return apiJson<ItemsResponse<TelegramReader>>(`${telegramBase(orgId)}/reader`).then(
    (res) => res.items,
  );
}

export function createReader(orgId: string, body: CreateReaderBody): Promise<TelegramReader> {
  return apiJson<ReaderResponse>(`${telegramBase(orgId)}/reader`, {
    method: 'POST',
    body: JSON.stringify(body),
  }).then((res) => res.reader);
}

export function authorizeReader(
  orgId: string,
  body: AuthorizeReaderBody,
): Promise<TelegramReader | null> {
  return apiJson<AuthorizeReaderResponse>(`${telegramBase(orgId)}/reader/authorize`, {
    method: 'POST',
    body: JSON.stringify(body),
  }).then((res) => res.reader);
}

export function deleteReader(orgId: string, readerId: string): Promise<void> {
  return apiJson<void>(`${telegramBase(orgId)}/reader/${encodeURIComponent(readerId)}`, {
    method: 'DELETE',
  });
}

export function listSources(orgId: string): Promise<TelegramSource[]> {
  return apiJson<ItemsResponse<TelegramSource>>(`${telegramBase(orgId)}/sources`).then(
    (res) => res.items,
  );
}

export function addSource(orgId: string, body: AddSourceBody): Promise<TelegramSource> {
  return apiJson<SourceResponse>(`${telegramBase(orgId)}/sources`, {
    method: 'POST',
    body: JSON.stringify(body),
  }).then((res) => res.source);
}

export function deleteSource(orgId: string, sourceId: string): Promise<void> {
  return apiJson<void>(`${telegramBase(orgId)}/sources/${encodeURIComponent(sourceId)}`, {
    method: 'DELETE',
  });
}

export function backfillSource(
  orgId: string,
  sourceId: string,
  limit: number,
): Promise<BackfillResult> {
  return apiJson<BackfillResult>(
    `${telegramBase(orgId)}/sources/${encodeURIComponent(sourceId)}/backfill`,
    { method: 'POST', body: JSON.stringify({ limit }) },
  );
}

export function listPosts(orgId: string, query: ListPostsQuery = {}): Promise<TelegramPost[]> {
  const params = new URLSearchParams();
  if (query.sourceId) {
    params.set('sourceId', query.sourceId);
  }
  if (query.outcome) {
    params.set('outcome', query.outcome);
  }
  if (query.limit) {
    params.set('limit', String(query.limit));
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return apiJson<ItemsResponse<TelegramPost>>(`${telegramBase(orgId)}/posts${suffix}`).then(
    (res) => res.items,
  );
}

export function listRules(orgId: string): Promise<TelegramRule[]> {
  return apiJson<ItemsResponse<TelegramRule>>(`${telegramBase(orgId)}/rules`).then(
    (res) => res.items,
  );
}

export function createRule(orgId: string, body: RuleBody): Promise<TelegramRule> {
  return apiJson<RuleResponse>(`${telegramBase(orgId)}/rules`, {
    method: 'POST',
    body: JSON.stringify(body),
  }).then((res) => res.rule);
}

export function updateRule(orgId: string, ruleId: string, body: RuleBody): Promise<TelegramRule> {
  return apiJson<RuleResponse>(`${telegramBase(orgId)}/rules/${encodeURIComponent(ruleId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }).then((res) => res.rule);
}

export function deleteRule(orgId: string, ruleId: string): Promise<void> {
  return apiJson<void>(`${telegramBase(orgId)}/rules/${encodeURIComponent(ruleId)}`, {
    method: 'DELETE',
  });
}
