import type { OrgManagerDeps } from './org-manager.port.ts';

let current: OrgManagerDeps | undefined;

export function setManagerToolsDeps(deps: OrgManagerDeps): void {
  current = deps;
}

export function managerToolsDeps(): OrgManagerDeps | undefined {
  return current;
}
