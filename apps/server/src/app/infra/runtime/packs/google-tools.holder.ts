import type { OrgGoogleDeps } from './org-google.port.ts';

let current: OrgGoogleDeps | undefined;

export function setGoogleToolsDeps(deps: OrgGoogleDeps): void {
  current = deps;
}

export function googleToolsDeps(): OrgGoogleDeps | undefined {
  return current;
}
