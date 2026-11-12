import { AddonError } from '@harnesys/sdk';
import { z } from 'zod';

const ACCOUNT_ID = z.string().min(1).optional();
const REPO = z.string().min(1);
const NUMBER = z.number().int().positive();
const LIMIT = z.number().int().min(1).max(50).optional();
const TEXT = z.string().min(1);
const OPTIONAL_TEXT = z.string().optional();
const LABELS = z.array(z.string().min(1)).min(1);

export const AccountSchema = z.looseObject({ accountId: ACCOUNT_ID });
export const RepoSchema = z.looseObject({ repo: REPO, accountId: ACCOUNT_ID });
export const LimitSchema = z.looseObject({ limit: LIMIT });
export const IssueRefSchema = z.looseObject({ repo: REPO, number: NUMBER, accountId: ACCOUNT_ID });
export const FileSchema = z.looseObject({
  repo: REPO,
  path: TEXT,
  ref: OPTIONAL_TEXT,
  accountId: ACCOUNT_ID,
});
export const SearchCodeSchema = z.looseObject({
  query: TEXT,
  repo: OPTIONAL_TEXT,
  limit: LIMIT,
  accountId: ACCOUNT_ID,
});
export const IssueListSchema = z.looseObject({
  repo: REPO,
  state: z.enum(['open', 'closed', 'all']).optional(),
  limit: LIMIT,
  accountId: ACCOUNT_ID,
});
export const IssueCreateSchema = z.looseObject({
  repo: REPO,
  title: TEXT,
  body: OPTIONAL_TEXT,
  labels: LABELS.optional(),
  accountId: ACCOUNT_ID,
});
export const IssueCommentSchema = z.looseObject({
  repo: REPO,
  number: NUMBER,
  body: TEXT,
  accountId: ACCOUNT_ID,
});
export const LabelsSchema = z.looseObject({
  repo: REPO,
  number: NUMBER,
  labels: LABELS,
  accountId: ACCOUNT_ID,
});
export const PrCreateSchema = z.looseObject({
  repo: REPO,
  head: TEXT,
  base: OPTIONAL_TEXT,
  title: TEXT,
  body: OPTIONAL_TEXT,
  draft: z.boolean().optional(),
  accountId: ACCOUNT_ID,
});
export const PrUpdateSchema = z.looseObject({
  repo: REPO,
  number: NUMBER,
  title: OPTIONAL_TEXT,
  body: OPTIONAL_TEXT,
  state: z.enum(['open', 'closed']).optional(),
  accountId: ACCOUNT_ID,
});
export const PrReviewSchema = z.looseObject({
  repo: REPO,
  number: NUMBER,
  event: z.enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT']),
  body: OPTIONAL_TEXT,
  accountId: ACCOUNT_ID,
});
export const PrMergeSchema = z.looseObject({
  repo: REPO,
  number: NUMBER,
  mergeMethod: z.enum(['merge', 'squash', 'rebase']).optional(),
  accountId: ACCOUNT_ID,
});
export const RunsSchema = z.looseObject({
  repo: REPO,
  branch: OPTIONAL_TEXT,
  limit: LIMIT,
  accountId: ACCOUNT_ID,
});
export const RunRefSchema = z.looseObject({
  repo: REPO,
  runId: NUMBER,
  accountId: ACCOUNT_ID,
});

export function parseWith<T>(
  tool: string,
  schema: z.ZodType<T>,
  input: Record<string, unknown>,
): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new AddonError('invalid_params', { detail: `${tool}: ${issues}` });
  }
  return parsed.data;
}

export function accountOf(accountId: string | undefined): { accountId?: string } {
  return accountId === undefined ? {} : { accountId };
}

export function limitOf(value: number | undefined, fallback: number, max: number): number {
  return Math.min(Math.max(value ?? fallback, 1), max);
}

export function repoPath(repo: string, suffix: string): string {
  const slash = repo.indexOf('/');
  if (slash <= 0 || slash === repo.length - 1) {
    throw new AddonError('invalid_params', { detail: `repo must be owner/name, got: ${repo}` });
  }
  return `/repos/${repo.slice(0, slash)}/${repo.slice(slash + 1)}${suffix}`;
}
