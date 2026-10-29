import { watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProjectFileEvent } from '@harnesys/studio-shared';
import { FILES_WATCHER_DEBOUNCE_MS } from '../../../const.ts';
import { trace } from '../../libs/trace.ts';

interface GitWatcherState {
  gitWatcher: ReturnType<typeof watch> | null;
  gitDebounceTimer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
  onGitChange?: () => void;
  listeners: Set<(event: ProjectFileEvent) => void>;
}
export async function startGitWatcher(
  state: GitWatcherState,
  projectId: string,
  projectPath: string,
  onGitChange?: () => void,
): Promise<void> {
  state.onGitChange = onGitChange;
  const gitPath = join(projectPath, '.git');
  let target = gitPath;
  try {
    const info = await stat(gitPath);
    if (info.isFile()) {
      const content = await readFile(gitPath, 'utf8').catch(() => '');
      const m = content.match(/gitdir:\s*(.+)/);
      if (m?.[1]) {
        const gitdir = m[1].trim();
        target = gitdir.startsWith('/') ? gitdir : join(projectPath, gitdir);
      }
    }
  } catch {
    return;
  }
  const handleGitChange = () => {
    if (state.closed) {
      return;
    }
    if (state.gitDebounceTimer) {
      clearTimeout(state.gitDebounceTimer);
    }
    state.gitDebounceTimer = setTimeout(() => {
      if (state.closed) {
        return;
      }
      trace('files-watcher', 'git change', { projectId });
      const ev: ProjectFileEvent = { kind: 'change', dir: '.git', name: 'HEAD' };
      for (const listener of [...state.listeners]) {
        try {
          listener(ev);
        } catch (err) {
          trace('files-watcher', 'git listener error', { error: String(err) });
        }
      }
      state.onGitChange?.();
    }, FILES_WATCHER_DEBOUNCE_MS);
  };
  try {
    const gitWatcher = watch(target, { recursive: true }, (_et, filename) => {
      if (!filename) {
        handleGitChange();
        return;
      }
      if (
        filename === 'HEAD' ||
        filename === 'index' ||
        filename.startsWith('refs/heads') ||
        filename.startsWith('refs\\heads')
      ) {
        handleGitChange();
      }
    });
    gitWatcher.on('error', (err) => {
      trace('files-watcher', 'git watcher error', { projectId, error: String(err) });
    });
    state.gitWatcher = gitWatcher;
    trace('files-watcher', 'git watcher started', { projectId, target });
  } catch (err) {
    trace('files-watcher', 'git watcher failed', { projectId, error: String(err) });
  }
}
