import type { ProjectFileEvent } from '@harnesys/studio-shared';
import { SAFETY_NAMES } from '../../../const.ts';
import type { FilesWatcherPort } from '../../domain/knowledge/files-watcher.port.ts';
import { trace } from '../../libs/trace.ts';
import type { SqliteKnowledgeIndexRepo } from './knowledge-index-repo.ts';
import type { KnowledgeIndexer } from './knowledge-indexer.ts';
import { uriUnderEnabledRoots } from './knowledge-walk-ignore.ts';

export interface KnowledgeWatchBridgeOptions {
  resolveContentRoot: (sourceId: string) => string | undefined;
  listSourceIds: () => string[];
  indexRepo: SqliteKnowledgeIndexRepo;
  indexer: KnowledgeIndexer;
  listEnabledRoots: (sourceId: string) => string[];
  filesWatcher: FilesWatcherPort;
}

export class KnowledgeWatchBridge {
  private readonly stops = new Map<string, () => void>();

  constructor(private readonly options: KnowledgeWatchBridgeOptions) {}

  start(): void {
    for (const sourceId of this.options.listSourceIds()) {
      this.options.indexRepo.purgeByFirstSegment(sourceId, SAFETY_NAMES);
      const settings = this.options.indexRepo.getSettingsOrDefault(sourceId);
      this.syncWatch(sourceId, settings.watchEnabled);
    }
  }

  syncWatch(sourceId: string, watchEnabled: boolean): void {
    if (!watchEnabled) {
      this.stopWatch(sourceId);
      return;
    }
    if (this.stops.has(sourceId)) {
      return;
    }
    const root = this.options.resolveContentRoot(sourceId);
    if (!root) {
      return;
    }
    const stop = this.options.filesWatcher.watch(sourceId, root, (event) => {
      this.onEvent(sourceId, event);
    });
    this.stops.set(sourceId, stop);
    trace('knowledge-watch', 'watch started', { sourceId, root });
  }

  stopWatch(sourceId: string): void {
    const stop = this.stops.get(sourceId);
    if (!stop) {
      return;
    }
    stop();
    this.stops.delete(sourceId);
  }

  stop(): void {
    for (const sourceId of [...this.stops.keys()]) {
      this.stopWatch(sourceId);
    }
  }

  private onEvent(sourceId: string, event: ProjectFileEvent): void {
    const rel = event.dir ? `${event.dir}/${event.name}` : event.name;
    const settings = this.options.indexRepo.getSettingsOrDefault(sourceId);
    if (!settings.watchEnabled) {
      return;
    }
    if (!settings.entireSource) {
      const roots = this.options.listEnabledRoots(sourceId);
      if (!uriUnderEnabledRoots(rel, roots)) {
        return;
      }
    }
    if (event.kind === 'delete') {
      this.options.indexRepo.deleteFileAndChunks(sourceId, rel);
      return;
    }
    this.options.indexer.enqueuePaths(sourceId, [rel]);
  }
}
