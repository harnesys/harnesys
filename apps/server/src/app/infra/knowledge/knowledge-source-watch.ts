import type { ProjectFileEvent } from '@harnesys/studio-shared';
import { FilesWatcherPort } from '../../domain/knowledge/files-watcher.port.ts';

export type KnowledgeFileEventHandler = (
  orgId: string,
  sourceId: string,
  uri: string,
  removed: boolean,
) => void;

export class KnowledgeSourceWatch {
  private readonly stops = new Map<string, () => void>();

  constructor(private readonly filesWatcher: FilesWatcherPort) {}

  sync(input: {
    orgId: string;
    sourceId: string;
    contentRoot: string | undefined;
    watchEnabled: boolean;
    onEvent: KnowledgeFileEventHandler;
  }): void {
    const key = `${input.orgId}:${input.sourceId}`;
    if (!input.watchEnabled || !input.contentRoot) {
      this.stop(key);
      return;
    }
    if (this.stops.has(key)) {
      return;
    }
    const stop = this.filesWatcher.watch(input.sourceId, input.contentRoot, (event) => {
      const uri = relPath(event);
      input.onEvent(input.orgId, input.sourceId, uri, event.kind === 'delete');
    });
    this.stops.set(key, stop);
  }

  stopSource(orgId: string, sourceId: string): void {
    this.stop(`${orgId}:${sourceId}`);
  }

  private stop(key: string): void {
    const stop = this.stops.get(key);
    if (!stop) {
      return;
    }
    stop();
    this.stops.delete(key);
  }
}

function relPath(event: ProjectFileEvent): string {
  return event.dir ? `${event.dir}/${event.name}` : event.name;
}
