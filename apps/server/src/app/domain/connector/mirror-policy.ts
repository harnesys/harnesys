import { COALESCE_MS, DEFAULT_MIRROR_POLICY, type MirrorPolicy } from './constants.ts';
import { shouldEchoUser } from './echo.ts';

export type OutboundAction = 'text' | 'ask' | 'failed' | 'file' | 'skip';

export interface MirrorEvent {
  type: string;
  origin?: string;
  connectorId?: string;
}

type PolicyFlag = keyof Pick<
  MirrorPolicy,
  'text' | 'ask' | 'failures' | 'files' | 'tool' | 'spawn' | 'reasoning'
>;

const FLAG_ACTION: Record<string, { flag: PolicyFlag; action: OutboundAction }> = {
  'text-delta': { flag: 'text', action: 'text' },
  text: { flag: 'text', action: 'text' },
  ask: { flag: 'ask', action: 'ask' },
  'run.failed': { flag: 'failures', action: 'failed' },
  file: { flag: 'files', action: 'file' },
  tool: { flag: 'tool', action: 'text' },
  'agent.spawned': { flag: 'spawn', action: 'text' },
  'agent.completed': { flag: 'spawn', action: 'text' },
};

export function outboundAction(policy: MirrorPolicy, event: MirrorEvent): OutboundAction {
  if (event.type === 'user') {
    return userOutbound(policy, event);
  }
  if (event.type.startsWith('reasoning')) {
    return policy.reasoning ? 'text' : 'skip';
  }
  const mapped = FLAG_ACTION[event.type];
  if (mapped === undefined) {
    return 'skip';
  }
  return policy[mapped.flag] ? mapped.action : 'skip';
}

export function parseMirrorPatch(input: unknown): MirrorPolicy {
  const patch = asRecord(input);
  return {
    text: readBool(patch, 'text', DEFAULT_MIRROR_POLICY.text),
    ask: readBool(patch, 'ask', DEFAULT_MIRROR_POLICY.ask),
    failures: readBool(patch, 'failures', DEFAULT_MIRROR_POLICY.failures),
    files: readBool(patch, 'files', DEFAULT_MIRROR_POLICY.files),
    appUserEcho: readBool(patch, 'appUserEcho', DEFAULT_MIRROR_POLICY.appUserEcho),
    tool: false,
    spawn: false,
    reasoning: false,
    coalesceMs: COALESCE_MS,
  };
}

function userOutbound(policy: MirrorPolicy, event: MirrorEvent): OutboundAction {
  const connectorId = event.connectorId;
  if (connectorId !== undefined && !shouldEchoUser(event.origin ?? '', connectorId)) {
    return 'skip';
  }
  return policy.appUserEcho ? 'text' : 'skip';
}

function asRecord(input: unknown): Record<string, unknown> | null {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }
  return input as Record<string, unknown>;
}

function readBool(patch: Record<string, unknown> | null, key: string, fallback: boolean): boolean {
  if (patch === null) {
    return fallback;
  }
  const value = patch[key];
  return typeof value === 'boolean' ? value : fallback;
}
