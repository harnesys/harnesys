import { Injectable } from '@harnesys/brix';
import type { ProjectFileEvent, SourceWatchEvent } from '@harnesys/studio-shared';
import { FilesWatcherPort } from '../../domain/knowledge/files-watcher.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { SourceWatchEventsPort } from '../../domain/source/source-watch-events.port.ts';
import { SourceWatchGatePort } from '../../domain/source/source-watch-gate.port.ts';
import { boundHostId } from '../../domain/source/ui-visibility.policy.ts';
import { trace } from '../../libs/trace.ts';

export function toSourceWatchEvent(event: ProjectFileEvent): SourceWatchEvent {
  const changedPath = event.dir ? `${event.dir}/${event.name}` : event.name;
  return event.dir === '.git' ? { kind: 'git', changedPath } : { kind: 'fs', changedPath };
}

@Injectable()
export class SourceWatchBridge extends SourceWatchGatePort {
  private readonly refs = new Map<string, number>();
  private readonly stops = new Map<string, Map<string, () => void>>();

  constructor(
    private readonly filesWatcher: FilesWatcherPort,
    private readonly sources: SourceRegistryPort,
    private readonly sourceLocation: SourceLocationPort,
    private readonly machine: MachineConfigPort,
    private readonly events: SourceWatchEventsPort,
  ) {
    super();
  }

  acquire(orgId: string): () => void {
    const count = (this.refs.get(orgId) ?? 0) + 1;
    this.refs.set(orgId, count);
    if (count === 1) {
      this.startWatches(orgId);
    }
    return () => this.release(orgId);
  }

  private startWatches(orgId: string): void {
    const hostId = this.machine.get().id;
    const stops = new Map<string, () => void>();
    for (const source of this.sources.list(orgId)) {
      const bound = boundHostId(source.distribution);
      if (bound !== null && bound !== hostId) {
        continue;
      }
      let root: string;
      try {
        root = this.sourceLocation.resolve({ orgId, sourceId: source.id, hostId }).absoluteRoot;
      } catch (err) {
        trace('source-watch', 'watch missing', {
          orgId,
          sourceId: source.id,
          error: eventMessage(err),
        });
        continue;
      }
      try {
        stops.set(
          source.id,
          this.filesWatcher.watch(source.id, root, (event) => {
            this.events.publish(orgId, source.id, toSourceWatchEvent(event));
          }),
        );
      } catch (err) {
        trace('source-watch', 'watch failed', {
          orgId,
          sourceId: source.id,
          error: eventMessage(err),
        });
      }
    }
    this.stops.set(orgId, stops);
  }

  private release(orgId: string): void {
    const count = (this.refs.get(orgId) ?? 1) - 1;
    if (count > 0) {
      this.refs.set(orgId, count);
      return;
    }
    this.refs.delete(orgId);
    const stops = this.stops.get(orgId);
    if (!stops) {
      return;
    }
    for (const stop of stops.values()) {
      stop();
    }
    this.stops.delete(orgId);
  }
}

function eventMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
