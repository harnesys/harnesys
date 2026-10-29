export const PAIR_CODE_TTL_MS = 30 * 60 * 1000;
export const DRAFT_SPLIT_AT = 4000;
export const DRAFT_MAX = 4096;
export const COALESCE_MS = 300;
export const DRAFT_HEARTBEAT_MS = 20_000;
export const LEASE_MS = 15_000;
export const LEASE_RENEW_MS = 5_000;
export const CHANNEL_NOTE =
  'The user is talking in Telegram. Write a reply that fits a chat message. The live preview is capped at 4096 characters per bubble.';

export interface MirrorPolicy {
  text: boolean;
  ask: boolean;
  failures: boolean;
  files: boolean;
  appUserEcho: boolean;
  tool: boolean;
  spawn: boolean;
  reasoning: boolean;
  coalesceMs: number;
}

export const DEFAULT_MIRROR_POLICY: MirrorPolicy = {
  text: true,
  ask: true,
  failures: true,
  files: true,
  appUserEcho: true,
  tool: false,
  spawn: false,
  reasoning: false,
  coalesceMs: COALESCE_MS,
};
