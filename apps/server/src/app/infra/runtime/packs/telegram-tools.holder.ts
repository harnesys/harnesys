import type { OrgTelegramDeps } from './org-telegram.port.ts';

let current: OrgTelegramDeps | undefined;

export function setTelegramToolsDeps(deps: OrgTelegramDeps): void {
  current = deps;
}

export function telegramToolsDeps(): OrgTelegramDeps | undefined {
  return current;
}
