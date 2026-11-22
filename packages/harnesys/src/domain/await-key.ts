export const ISSUE_WAKE_PREFIX = 'issue:';
export function issueWakeKey(issueId: string): string {
  return `${ISSUE_WAKE_PREFIX}${issueId}`;
}
export function parseIssueWakeKey(key: string): string | null {
  if (!key.startsWith(ISSUE_WAKE_PREFIX)) {
    return null;
  }
  const issueId = key.slice(ISSUE_WAKE_PREFIX.length);
  return issueId.length > 0 ? issueId : null;
}
