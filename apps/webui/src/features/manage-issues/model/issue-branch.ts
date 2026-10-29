export function normalizeIssueBranchSlug(title: string, maxLength = 48): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return slug.length > 0 ? slug : 'issue';
}

export function issueWorktreeBranchPreview(issueId: string, title: string): string {
  return `issue/${shortIssueId(issueId)}-${normalizeIssueBranchSlug(title)}`;
}

export type IssueWorkspacePlanView = 'worktree' | 'checkout' | 'held';

export function issueWorkspacePlanView(input: {
  worktree: { branch: string } | null;
  branch: string | null;
  activeBranch: string | null;
}): IssueWorkspacePlanView {
  if (input.worktree) {
    return 'worktree';
  }
  if (!input.branch) {
    return 'checkout';
  }
  if (input.activeBranch === null) {
    return 'held';
  }
  return input.activeBranch.trim().toLowerCase() === input.branch.trim().toLowerCase()
    ? 'checkout'
    : 'held';
}

function shortIssueId(issueId: string): string {
  const head = issueId.split('-')[0] ?? '';
  return head || issueId;
}
