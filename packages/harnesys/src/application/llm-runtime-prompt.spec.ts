import { describe, expect, test } from 'bun:test';
import type { RuntimePromptInfo } from '../ports/runtime-prompt.ts';
import { formatRuntimeSection } from './llm.ts';

const chatSandbox: RuntimePromptInfo = {
  hostName: 'local',
  environment: 'host',
  primaryDirectory: '/org/thread/sandbox',
  primaryKind: 'sandbox',
  threadSandbox: '/org/thread/sandbox',
  sharedSources: [
    {
      name: 'harnesys',
      path: '/shared/harnesys',
      description: 'monorepo',
      indexState: 'entire-source',
    },
    { name: 'docs', path: '/shared/docs', description: null, indexState: 'not-indexed' },
  ],
};

const directory: RuntimePromptInfo = {
  hostName: 'local',
  environment: 'host',
  primaryDirectory: '/srv/project',
  primaryKind: 'directory',
  threadSandbox: '/org/thread/sandbox',
  sharedSources: [],
};

const worktree: RuntimePromptInfo = {
  hostName: 'local',
  environment: 'host',
  primaryDirectory: '/worktrees/repo-feat-x',
  primaryKind: 'worktree',
  threadSandbox: '/org/thread/sandbox',
  sharedSources: [],
  worktree: {
    repository: 'https://github.com/org/repo',
    branch: 'feat/x',
    path: '/worktrees/repo-feat-x',
  },
};

const sourceBase: RuntimePromptInfo = {
  hostName: 'local',
  environment: 'host',
  primaryDirectory: '/sources/repo',
  primaryKind: 'source',
  threadSandbox: '/org/thread/sandbox',
  sharedSources: [],
};

describe('formatRuntimeSection', () => {
  test('chat sandbox renders sources with description and index state, omitting empty description', () => {
    const text = formatRuntimeSection(chatSandbox);
    expect(text).toContain('Host: local');
    expect(text).toContain('Environment: Host');
    expect(text).toContain('- Run root: /org/thread/sandbox (sandbox)');
    expect(text).toContain(
      '- All file tools accept absolute paths; stay inside the run root — access outside it requires user approval.',
    );
    expect(text).toContain('Temporary workspace: /org/thread/sandbox');
    expect(text).toContain('harnesys (entire-source): /shared/harnesys — monorepo');
    expect(text).toContain('docs (not-indexed): /shared/docs');
    expect(text).not.toContain('null');
  });

  test('directory primary renders the workspace line with scratch', () => {
    const text = formatRuntimeSection(directory);
    expect(text).toContain('- Run root: /srv/project (directory)');
    expect(text).toContain(
      '- Workspace: /srv/project — directory bound to this thread (shared host state; changes are immediate)',
    );
    expect(text).toContain(
      '- Scratch: /org/thread/sandbox (private, temporary — keep only temp files here)',
    );
    expect(text).not.toContain('Temporary workspace');
  });

  test('worktree primary renders the workspace line with repo, branch and scratch', () => {
    const text = formatRuntimeSection(worktree);
    expect(text).toContain(
      '- Workspace: /worktrees/repo-feat-x — git worktree of "https://github.com/org/repo" @ feat/x (isolated; deliver via the branch)',
    );
    expect(text).toContain(
      '- Scratch: /org/thread/sandbox (private, temporary — keep only temp files here)',
    );
    expect(text).not.toContain('Temporary workspace');
  });

  test('source primary renders the workspace line per kind plus scratch', () => {
    const folder = formatRuntimeSection({
      ...sourceBase,
      primaryDirectory: '/sources/docs',
      primarySource: { name: 'docs', kind: 'folder' },
    });
    expect(folder).toContain(
      '- Workspace: /sources/docs — source "docs" (shared folder; changes are immediate)',
    );
    const git = formatRuntimeSection({
      ...sourceBase,
      primarySource: { name: 'repo', kind: 'git', branch: 'main' },
    });
    expect(git).toContain(
      '- Workspace: /sources/repo — active checkout of "repo" on main (shared state; check git status before editing; never run parallel issues here)',
    );
    expect(folder).toContain(
      '- Scratch: /org/thread/sandbox (private, temporary — keep only temp files here)',
    );
    expect(git).not.toContain('Temporary workspace');
  });

  test('empty runtime produces empty string', () => {
    expect(formatRuntimeSection(undefined)).toBe('');
  });
});
