import { AddonError } from '@harnesys/sdk';

export interface InviteJoinTarget {
  kind: 'invite';
  link: string;
  label: string;
}

export interface UsernameJoinTarget {
  kind: 'username';
  username: string;
  label: string;
}

export type JoinTarget = InviteJoinTarget | UsernameJoinTarget;

const INVITE_PATHS = ['+', 'joinchat'];

function inviteTarget(hash: string): InviteJoinTarget {
  return {
    kind: 'invite',
    link: `https://t.me/+${hash}`,
    label: `invite:${hash}`,
  };
}

function normalize(value: string): string {
  return value.replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, '');
}

export function joinTargetOf(value: unknown): JoinTarget {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AddonError('invalid_params', { detail: 'link is required' });
  }
  const raw = value.trim();
  const path = normalize(raw);
  const segments = path.split('/').filter((segment) => segment.length > 0);
  const head = segments[0] ?? '';
  if (head.startsWith('+') && head.length > 1) {
    return inviteTarget(head.slice(1));
  }
  if (INVITE_PATHS.includes(head.toLowerCase()) && segments.length > 1) {
    const hash = segments[1] ?? '';
    if (hash.length > 0) {
      return inviteTarget(hash);
    }
  }
  if (head.startsWith('+')) {
    throw new AddonError('invalid_params', {
      detail: `invite link is missing its hash: "${value}"`,
    });
  }
  const username = head.replace(/^@/, '').toLowerCase();
  if (username.length === 0 || username.includes('?')) {
    throw new AddonError('invalid_params', {
      detail: `link must be @username, t.me/username or an invite link, got "${value}"`,
    });
  }
  return { kind: 'username', username, label: `@${username}` };
}
