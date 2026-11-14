import { apiJson } from '@/shared/api/client';
import type {
  ListPostsQuery,
  RuleBody,
  TelegramPost,
  TelegramRule,
  TelegramSource,
} from './model/types';

interface ItemsResponse<T> {
  items: T[];
}
interface RuleResponse {
  rule: TelegramRule;
}

function telegramBase(orgId: string): string {
  return `/api/orgs/${encodeURIComponent(orgId)}/integrations/telegram`;
}

export function listSources(orgId: string): Promise<TelegramSource[]> {
  return apiJson<ItemsResponse<TelegramSource>>(`${telegramBase(orgId)}/sources`).then(
    (res) => res.items,
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
