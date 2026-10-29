import type { OrgIssueDeps } from './org-issue.port.ts';

let current: OrgIssueDeps | undefined;

export function setIssueToolsDeps(deps: OrgIssueDeps): void {
  current = deps;
}

export function issueToolsDeps(): OrgIssueDeps | undefined {
  return current;
}
