import { describe, expect, test } from 'bun:test';
import type { SourceAvailability, SourceVcs } from '@harnesys/contracts';
import { hasGitRemote, hasGitVcs, sourceHostAvailability } from './vcs-capability.ts';

const vcsWithRemote: SourceVcs = {
  engine: 'git',
  remoteUrl: 'https://github.com/x/y.git',
  credRef: null,
  defaultBranch: 'main',
};

const origin = {
  id: 's-1',
  distribution: { kind: 'host-bound' as const, hostId: 'h-origin' },
  vcs: null as SourceVcs | null,
  availability: { hostIds: ['h-vps'] } as SourceAvailability,
};

describe('hasGitVcs / hasGitRemote', () => {
  test('vcs null is not git, remote null is not remote', () => {
    expect(hasGitVcs({ vcs: null })).toBe(false);
    expect(hasGitRemote({ vcs: null })).toBe(false);
    expect(hasGitVcs({ vcs: { ...vcsWithRemote, remoteUrl: null } })).toBe(true);
    expect(hasGitRemote({ vcs: { ...vcsWithRemote, remoteUrl: null } })).toBe(false);
    expect(hasGitVcs({ vcs: vcsWithRemote })).toBe(true);
    expect(hasGitRemote({ vcs: vcsWithRemote })).toBe(true);
  });
});

describe('sourceHostAvailability', () => {
  test('origin host is always allowed', () => {
    expect(sourceHostAvailability(origin as never, 'h-origin')).toEqual({
      allowed: true,
      reason: 'origin',
    });
  });

  test('host-bound other host requires remote and allowlist', () => {
    const withRemote = { ...origin, vcs: vcsWithRemote };
    expect(sourceHostAvailability(origin as never, 'h-vps')).toEqual({
      allowed: false,
      reason: 'needs-remote',
    });
    expect(sourceHostAvailability(withRemote as never, 'h-vps')).toEqual({
      allowed: true,
      reason: 'allowed',
    });
    expect(
      sourceHostAvailability({ ...withRemote, availability: { hostIds: [] } } as never, 'h-vps'),
    ).toEqual({ allowed: false, reason: 'excluded' });
  });

  test('excluded host with existing materialization stays excluded', () => {
    const withRemote = { ...origin, vcs: vcsWithRemote };
    expect(
      sourceHostAvailability({ ...withRemote, availability: { hostIds: [] } } as never, 'h-vps'),
    ).toEqual({ allowed: false, reason: 'excluded' });
  });
});
