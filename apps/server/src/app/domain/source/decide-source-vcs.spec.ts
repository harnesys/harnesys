import { describe, expect, test } from 'bun:test';
import type { SourceVcs } from '@harnesys/contracts';
import { decideSourceVcsUpdate } from './decide-source-vcs.ts';
import type { VcsProbeRaw } from './git-vcs.port.ts';

const current: SourceVcs = {
  engine: 'git',
  remoteUrl: 'https://github.com/x/y.git',
  credRef: 'gh:default',
  defaultBranch: 'main',
  integrationId: null,
};

describe('decideSourceVcsUpdate', () => {
  test('probe found writes new vcs preserving credRef', () => {
    const probe: VcsProbeRaw = {
      isGit: true,
      defaultBranch: 'trunk',
      remoteUrl: 'https://github.com/x/z.git',
    };
    expect(decideSourceVcsUpdate(current, probe)).toEqual({
      engine: 'git',
      remoteUrl: 'https://github.com/x/z.git',
      credRef: 'gh:default',
      defaultBranch: 'trunk',
      integrationId: null,
    });
    expect(
      decideSourceVcsUpdate(null, { isGit: true, defaultBranch: 'main', remoteUrl: null }),
    ).toEqual({
      engine: 'git',
      remoteUrl: null,
      credRef: null,
      defaultBranch: 'main',
      integrationId: null,
    });
  });

  test('probe error never writes', () => {
    expect(decideSourceVcsUpdate(current, { error: true })).toBeUndefined();
    expect(decideSourceVcsUpdate(null, { error: true })).toBeUndefined();
  });

  test('not git clears, identical is no-op', () => {
    expect(
      decideSourceVcsUpdate(current, { isGit: false, defaultBranch: null, remoteUrl: null }),
    ).toBeNull();
    expect(
      decideSourceVcsUpdate(current, {
        isGit: true,
        defaultBranch: 'main',
        remoteUrl: 'https://github.com/x/y.git',
      }),
    ).toBeUndefined();
  });
});
