import { type Dirent, watch } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { ProjectFileEntry, ProjectFileEvent } from '@harnesys/studio-shared';
import { FILES_WATCHER_DEBOUNCE_MS, SAFETY_NAMES } from '../../../const.ts';
import { refreshSourceVcs } from '../../application/source/refresh-source-vcs.ts';
import { FilesWatcherPort } from '../../domain/knowledge/files-watcher.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { trace } from '../../libs/trace.ts';
import { startGitWatcher } from './files-watcher-git.ts';
import { type DirSnapshot, diff, snapshot } from './files-watcher-snapshot.ts';

type Listener = (event: ProjectFileEvent) => void;
interface WatchState {
  projectPath: string;
  listeners: Set<Listener>;
  snapshot: DirSnapshot;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  watcher: ReturnType<typeof watch> | null;
  gitWatcher: ReturnType<typeof watch> | null;
  gitDebounceTimer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
}
@Injectable()
export class FilesWatcherAdapter extends FilesWatcherPort {
  private readonly watchers = new Map<string, WatchState>();
  private readonly vcsOrgBySource = new Map<string, string>();

  constructor(
    private readonly orgs: OrgMachineStore,
    private readonly sources: SourceRegistryPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly git: GitVcsPort,
  ) {
    super();
  }

  watch(
    sourceId: string,
    projectPath: string,
    onEvent: (event: ProjectFileEvent) => void,
  ): () => void {
    const state = this.watchers.get(sourceId);
    if (state && state.projectPath === projectPath && !state.closed) {
      state.listeners.add(onEvent);
      trace('files-watcher', 'listener added', {
        sourceId,
        listeners: state.listeners.size,
        projectPath,
      });
      return () => this.removeListener(sourceId, onEvent);
    }
    if (state) {
      this.closeState(sourceId);
    }
    const newState: WatchState = {
      projectPath,
      listeners: new Set([onEvent]),
      snapshot: new Map(),
      debounceTimer: null,
      watcher: null,
      gitWatcher: null,
      gitDebounceTimer: null,
      closed: false,
    };
    this.watchers.set(sourceId, newState);
    void snapshot(projectPath, SAFETY_NAMES)
      .then((snap) => {
        if (!newState.closed) {
          newState.snapshot = snap;
          trace('files-watcher', 'initial snapshot', {
            sourceId,
            entries: snap.size,
          });
        }
      })
      .catch((err) => {
        trace('files-watcher', 'initial snapshot failed', {
          sourceId,
          error: String(err),
        });
      });
    const handleChange = () => {
      if (newState.closed) {
        return;
      }
      if (newState.debounceTimer) {
        clearTimeout(newState.debounceTimer);
      }
      newState.debounceTimer = setTimeout(async () => {
        if (newState.closed) {
          return;
        }
        try {
          const nextSnapshot = await snapshot(projectPath, SAFETY_NAMES);
          const events = diff(newState.snapshot, nextSnapshot);
          newState.snapshot = nextSnapshot;
          if (events.length > 0) {
            trace('files-watcher', 'diff events', {
              sourceId,
              count: events.length,
              events: events.slice(0, 5),
            });
          }
          for (const ev of events) {
            for (const listener of [...newState.listeners]) {
              try {
                listener(ev);
              } catch (err) {
                trace('files-watcher', 'listener error', { error: String(err) });
              }
            }
          }
        } catch (err) {
          trace('files-watcher', 'diff error', { error: String(err) });
        }
      }, FILES_WATCHER_DEBOUNCE_MS);
    };
    try {
      const watcher = watch(projectPath, { recursive: true }, (_eventType, filename) => {
        if (!filename) {
          return;
        }
        const parts = filename.split(/[/\\]/);
        if (parts.some((p) => SAFETY_NAMES.has(p))) {
          return;
        }
        handleChange();
      });
      watcher.on('error', (err) => {
        trace('files-watcher', 'fs.watch error', { sourceId, error: String(err) });
      });
      newState.watcher = watcher;
      trace('files-watcher', 'watch started (shared)', {
        sourceId,
        projectPath,
      });
    } catch (err) {
      trace('files-watcher', 'watch failed to start', { sourceId, error: String(err) });
    }
    void startGitWatcher(newState, sourceId, projectPath, () => this.handleGitChange(sourceId));
    return () => this.removeListener(sourceId, onEvent);
  }
  private removeListener(sourceId: string, onEvent: Listener): void {
    const state = this.watchers.get(sourceId);
    if (!state) {
      return;
    }
    state.listeners.delete(onEvent);
    trace('files-watcher', 'listener removed', {
      sourceId,
      remaining: state.listeners.size,
    });
    if (state.listeners.size === 0) {
      this.closeState(sourceId);
    }
  }
  private handleGitChange(sourceId: string): void {
    void (async () => {
      const memo = this.vcsOrgBySource.get(sourceId);
      const orgId = memo ?? this.resolveOrgId(sourceId);
      if (orgId === null) {
        return;
      }
      this.vcsOrgBySource.set(sourceId, orgId);
      await refreshSourceVcs(
        {
          sources: this.sources,
          materializations: this.materializations,
          git: this.git,
          localHostId: this.machineConfig.get().id,
        },
        orgId,
        sourceId,
      );
    })().catch((err) => {
      trace('files-watcher', 'vcs refresh failed', { sourceId, error: String(err) });
    });
  }

  private resolveOrgId(sourceId: string): string | null {
    for (const org of this.orgs.list()) {
      if (this.sources.findById(org.orgId, sourceId) !== null) {
        return org.orgId;
      }
    }
    return null;
  }

  private closeState(sourceId: string): void {
    const state = this.watchers.get(sourceId);
    if (!state) {
      return;
    }
    state.closed = true;
    this.vcsOrgBySource.delete(sourceId);
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
      state.debounceTimer = null;
    }
    if (state.gitDebounceTimer) {
      clearTimeout(state.gitDebounceTimer);
      state.gitDebounceTimer = null;
    }
    if (state.watcher) {
      try {
        state.watcher.close();
      } catch {}
    }
    if (state.gitWatcher) {
      try {
        state.gitWatcher.close();
      } catch {}
    }
    this.watchers.delete(sourceId);
    trace('files-watcher', 'watch closed', { sourceId });
  }
  async listTree(projectPath: string): Promise<ProjectFileEntry[]> {
    const results: ProjectFileEntry[] = [];
    await this.collectEntries(projectPath, '', results);
    return results;
  }
  private async collectEntries(
    absBase: string,
    relDir: string,
    results: ProjectFileEntry[],
  ): Promise<void> {
    const dirToRead = relDir ? join(absBase, relDir) : absBase;
    let dirents: Dirent[] = [];
    try {
      dirents = (await readdir(dirToRead, {
        withFileTypes: true,
        encoding: 'utf8',
      })) as Dirent[];
    } catch {
      return;
    }
    for (const d of dirents) {
      const name = String(d.name);
      if (SAFETY_NAMES.has(name)) {
        continue;
      }
      const relPath = relDir ? `${relDir}/${name}` : name;
      const isDir = d.isDirectory();
      results.push({
        name,
        kind: isDir ? 'dir' : 'file',
        path: relPath,
      });
      if (isDir) {
        await this.collectEntries(absBase, relPath, results);
      }
    }
  }
}
