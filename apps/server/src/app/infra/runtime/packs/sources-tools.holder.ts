import type { OrgSourcesDeps } from './org-sources.pack.port.ts';

let current: OrgSourcesDeps | undefined;

export function setSourcesToolsDeps(deps: OrgSourcesDeps): void {
  current = deps;
}

export function sourcesToolsDeps(): OrgSourcesDeps | undefined {
  return current;
}
