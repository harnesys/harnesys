import type { OrgGithubDeps } from './org-github.port.ts';

let current: OrgGithubDeps | undefined;

export function setGithubToolsDeps(deps: OrgGithubDeps): void {
  current = deps;
}

export function githubToolsDeps(): OrgGithubDeps | undefined {
  return current;
}
