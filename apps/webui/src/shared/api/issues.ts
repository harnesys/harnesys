import type {
  BoardRuleInput,
  BoardStatusInput,
  CreateIssueBoardBody,
  CreateIssueBoardResponse,
  CreateIssueBody,
  CreateIssueResponse,
  GetIssueBoardResponse,
  IssueBoardPublic,
  IssuePublic,
  ListIssueBoardsResponse,
  ListIssuesResponse,
  UpdateIssueBoardBody,
  UpdateIssueBody,
  UpdateIssueStatusBody,
} from '@harnesys/contracts';
import type { IssueRecord } from '@harnesys/studio-shared';
import { getActiveOrgId } from './active-org';
import { ApiError, apiJson } from './client';

export type IssueBoardRecord = IssueBoardPublic;

function requireOrgId(orgId?: string): string {
  const resolved = orgId ?? getActiveOrgId();
  if (!resolved) {
    throw new ApiError(400, 'No active organization');
  }
  return resolved;
}

function boardsBase(orgId: string): string {
  return `/api/orgs/${encodeURIComponent(orgId)}/boards`;
}

function issuesBase(orgId: string): string {
  return `/api/orgs/${encodeURIComponent(orgId)}/issues`;
}

function boardFrom(res: GetIssueBoardResponse | CreateIssueBoardResponse): IssueBoardRecord {
  return res.board;
}

export async function listIssueBoards(orgId?: string): Promise<IssueBoardRecord[]> {
  const resolved = requireOrgId(orgId);
  const res = await apiJson<ListIssueBoardsResponse>(boardsBase(resolved));
  return res.items;
}

export async function createIssueBoard(
  orgId: string,
  body: CreateIssueBoardBody,
): Promise<IssueBoardRecord> {
  const res = await apiJson<CreateIssueBoardResponse>(boardsBase(requireOrgId(orgId)), {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return boardFrom(res);
}

export async function updateIssueBoard(
  orgId: string,
  boardId: string,
  body: UpdateIssueBoardBody,
): Promise<IssueBoardRecord> {
  const res = await apiJson<GetIssueBoardResponse>(
    `${boardsBase(requireOrgId(orgId))}/${encodeURIComponent(boardId)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
  return boardFrom(res);
}

export async function addBoardStatus(
  orgId: string,
  boardId: string,
  input: BoardStatusInput,
): Promise<IssueBoardRecord> {
  const res = await apiJson<GetIssueBoardResponse>(
    `${boardsBase(requireOrgId(orgId))}/${encodeURIComponent(boardId)}/statuses`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return boardFrom(res);
}

export async function updateBoardStatus(
  orgId: string,
  boardId: string,
  statusKey: string,
  input: BoardStatusInput,
): Promise<IssueBoardRecord> {
  const res = await apiJson<GetIssueBoardResponse>(
    `${boardsBase(requireOrgId(orgId))}/${encodeURIComponent(boardId)}/statuses/${encodeURIComponent(statusKey)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
  return boardFrom(res);
}

export async function removeBoardStatus(
  orgId: string,
  boardId: string,
  statusKey: string,
): Promise<IssueBoardRecord> {
  const res = await apiJson<GetIssueBoardResponse>(
    `${boardsBase(requireOrgId(orgId))}/${encodeURIComponent(boardId)}/statuses/${encodeURIComponent(statusKey)}`,
    { method: 'DELETE' },
  );
  return boardFrom(res);
}

export async function reorderBoardStatuses(
  orgId: string,
  boardId: string,
  order: string[],
): Promise<IssueBoardRecord> {
  const res = await apiJson<GetIssueBoardResponse>(
    `${boardsBase(requireOrgId(orgId))}/${encodeURIComponent(boardId)}/statuses/order`,
    { method: 'PUT', body: JSON.stringify({ order }) },
  );
  return boardFrom(res);
}

export async function reorderBoardRules(
  orgId: string,
  boardId: string,
  order: string[],
): Promise<IssueBoardRecord> {
  const res = await apiJson<GetIssueBoardResponse>(
    `${boardsBase(requireOrgId(orgId))}/${encodeURIComponent(boardId)}/rules/order`,
    { method: 'PUT', body: JSON.stringify({ order }) },
  );
  return boardFrom(res);
}

export async function saveBoardRule(
  orgId: string,
  boardId: string,
  input: BoardRuleInput & { id?: string },
): Promise<IssueBoardRecord> {
  const { id, ...body } = input;
  const url = id
    ? `${boardsBase(requireOrgId(orgId))}/${encodeURIComponent(boardId)}/rules/${encodeURIComponent(id)}`
    : `${boardsBase(requireOrgId(orgId))}/${encodeURIComponent(boardId)}/rules`;
  const res = await apiJson<GetIssueBoardResponse>(url, {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(body),
  });
  return boardFrom(res);
}

export async function removeBoardRule(
  orgId: string,
  boardId: string,
  ruleId: string,
): Promise<IssueBoardRecord> {
  const res = await apiJson<GetIssueBoardResponse>(
    `${boardsBase(requireOrgId(orgId))}/${encodeURIComponent(boardId)}/rules/${encodeURIComponent(ruleId)}`,
    { method: 'DELETE' },
  );
  return boardFrom(res);
}

export async function deleteIssueBoard(orgId: string, boardId: string): Promise<void> {
  await apiJson<void>(`${boardsBase(requireOrgId(orgId))}/${encodeURIComponent(boardId)}`, {
    method: 'DELETE',
  });
}

export function setIssueBoardArchived(
  orgId: string,
  boardId: string,
  archived: boolean,
): Promise<IssueBoardRecord> {
  const action = archived ? 'archive' : 'unarchive';
  return apiJson<GetIssueBoardResponse>(
    `${boardsBase(requireOrgId(orgId))}/${encodeURIComponent(boardId)}/${action}`,
    { method: 'PATCH' },
  ).then((res) => boardFrom(res));
}

export async function listIssues(orgId?: string, boardId?: string): Promise<IssueRecord[]> {
  const resolved = requireOrgId(orgId);
  const query = boardId ? `?boardId=${encodeURIComponent(boardId)}` : '';
  const res = await apiJson<ListIssuesResponse>(`${issuesBase(resolved)}${query}`);
  return res.items;
}

export async function createIssueRecord(
  orgId: string,
  body: CreateIssueBody,
): Promise<IssueRecord> {
  const res = await apiJson<CreateIssueResponse>(issuesBase(requireOrgId(orgId)), {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.issue;
}

export function updateIssueRecord(
  orgId: string,
  issueId: string,
  body: UpdateIssueBody,
): Promise<IssueRecord> {
  return apiJson<{ issue: IssuePublic }>(
    `${issuesBase(requireOrgId(orgId))}/${encodeURIComponent(issueId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  ).then((res) => res.issue);
}

export function updateIssueStatusRecord(
  orgId: string,
  issueId: string,
  body: UpdateIssueStatusBody,
): Promise<IssueRecord> {
  return apiJson<{ issue: IssuePublic }>(
    `${issuesBase(requireOrgId(orgId))}/${encodeURIComponent(issueId)}/status`,
    { method: 'PATCH', body: JSON.stringify(body) },
  ).then((res) => res.issue);
}

export function nudgeIssueRecord(orgId: string, issueId: string): Promise<IssueRecord> {
  return apiJson<{ issue: IssuePublic }>(
    `${issuesBase(requireOrgId(orgId))}/${encodeURIComponent(issueId)}/nudge`,
    { method: 'POST' },
  ).then((res) => res.issue);
}

export async function deleteIssueRecord(orgId: string, issueId: string): Promise<void> {
  await apiJson<void>(`${issuesBase(requireOrgId(orgId))}/${encodeURIComponent(issueId)}`, {
    method: 'DELETE',
  });
}
