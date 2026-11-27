import { describe, expect, test } from 'bun:test';
import type { RuntimePromptInfo } from '../ports/runtime-prompt.ts';
import { formatRuntimeSection } from './llm.ts';

const chatSandbox: RuntimePromptInfo = {
  hostName: 'local',
  environment: 'host',
  primaryDirectory: '/org/thread',
  primaryKind: 'sandbox',
  threadDir: '/org/thread',
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
  threadDir: '/org/thread',
  sharedSources: [],
};

const worktree: RuntimePromptInfo = {
  hostName: 'local',
  environment: 'host',
  primaryDirectory: '/worktrees/repo-feat-x',
  primaryKind: 'worktree',
  threadDir: '/org/thread',
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
  threadDir: '/org/thread',
  sharedSources: [],
};

describe('formatRuntimeSection', () => {
  test('chat sandbox renders sources with description and index state, omitting empty description', () => {
    const text = formatRuntimeSection(chatSandbox);
    expect(text).toContain('Host: local');
    expect(text).toContain('Environment: Host');
    expect(text).toContain('- You are working inside `/org/thread` (sandbox).');
    expect(text).toContain(
      '- Prefer relative paths for files inside the run root; absolute paths only for files outside it. Access outside the run root requires user approval.',
    );
    expect(text).toContain(
      "- This is this thread's directory: everything in it is yours, except `attachments/` and `tool-outputs/` (read-only).",
    );
    expect(text).toContain('Temporary workspace: /org/thread');
    expect(text).toContain('harnesys (entire-source): /shared/harnesys — monorepo');
    expect(text).toContain('docs (not-indexed): /shared/docs');
    expect(text).not.toContain('null');
    expect(text).not.toContain('thread:');
  });

  test('directory primary renders the workspace line with scratch', () => {
    const text = formatRuntimeSection(directory);
    expect(text).toContain('- You are working inside `/srv/project` (directory).');
    expect(text).toContain(
      '- Workspace: /srv/project — directory bound to this thread (shared host state; changes are immediate)',
    );
    expect(text).toContain(
      '- Scratch: /org/thread (private, temporary — keep only temp files here)',
    );
    expect(text).toContain(
      '- Thread files: /org/thread — everything there is yours except `attachments/` and `tool-outputs/` (read-only); address thread files by absolute path. Files outside the run root require approval or access rules.',
    );
    expect(text).not.toContain('Temporary workspace');
  });

  test('worktree primary renders the workspace line with repo, branch and scratch', () => {
    const text = formatRuntimeSection(worktree);
    expect(text).toContain(
      '- Workspace: /worktrees/repo-feat-x — git worktree of "https://github.com/org/repo" @ feat/x (isolated; deliver via the branch)',
    );
    expect(text).toContain(
      '- Scratch: /org/thread (private, temporary — keep only temp files here)',
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
      '- Scratch: /org/thread (private, temporary — keep only temp files here)',
    );
    expect(git).not.toContain('Temporary workspace');
  });

  test('empty runtime produces empty string', () => {
    expect(formatRuntimeSection(undefined)).toBe('');
  });
});
