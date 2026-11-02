import { Injectable } from '@harnesys/brix';
import type {
  EventsWatchGitFileStatusFrame,
  EventsWatchGitSummaryFrame,
  GitSourceSummary,
} from '@harnesys/studio-shared';
import { GetGitFileStatusUseCase } from '../../application/source/get-git-file-status.use-case.ts';
import { GetOrgGitSummaryUseCase } from '../../application/source/get-org-git-summary.use-case.ts';
import { GitWatchEventsPort } from '../../domain/source/git-watch-events.port.ts';
import { SourceWatchEventsPort } from '../../domain/source/source-watch-events.port.ts';
import { trace } from '../../libs/trace.ts';

const DEBOUNCE_MS = 300;

@Injectable()
export class GitWatchEventsAdapter extends GitWatchEventsPort {
  private readonly summaryListeners = new Set<(frame: EventsWatchGitSummaryFrame) => void>();
  private readonly fileStatusListeners = new Set<(frame: EventsWatchGitFileStatusFrame) => void>();
  private readonly summaryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly fileStatusTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly summaryPending = new Set<string>();
  private readonly fileStatusPending = new Set<string>();

  constructor(
    private readonly sourceWatchEvents: SourceWatchEventsPort,
    private readonly getOrgGitSummary: GetOrgGitSummaryUseCase,
    private readonly getGitFileStatus: GetGitFileStatusUseCase,
  ) {
    super();
    this.sourceWatchEvents.subscribe((frame) => {
      this.scheduleSummary(frame.orgId);
      this.scheduleFileStatus(frame.orgId, frame.sourceId);
    });
  }

  subscribe(listener: (frame: EventsWatchGitSummaryFrame) => void): () => void {
    this.summaryListeners.add(listener);
    return () => this.summaryListeners.delete(listener);
  }

  publish(orgId: string, summaries: GitSourceSummary[]): void {
    const frame: EventsWatchGitSummaryFrame = { orgId, summaries };
    for (const listener of [...this.summaryListeners]) {
      try {
        listener(frame);
      } catch (err) {
        trace('git-watch-events', 'summary listener error', { error: String(err) });
      }
    }
  }

  subscribeFileStatus(listener: (frame: EventsWatchGitFileStatusFrame) => void): () => void {
    this.fileStatusListeners.add(listener);
    return () => this.fileStatusListeners.delete(listener);
  }

  publishFileStatus(frame: EventsWatchGitFileStatusFrame): void {
    for (const listener of [...this.fileStatusListeners]) {
      try {
        listener(frame);
      } catch (err) {
        trace('git-watch-events', 'file-status listener error', { error: String(err) });
      }
    }
  }

  private scheduleSummary(orgId: string): void {
    this.summaryPending.add(orgId);
    this.resetTimer(this.summaryTimers, orgId, () => {
      void this.flushSummary(orgId);
    });
  }

  private scheduleFileStatus(orgId: string, sourceId: string): void {
    this.fileStatusPending.add(sourceId);
    this.resetTimer(this.fileStatusTimers, sourceId, () => {
      void this.flushFileStatus(orgId, sourceId);
    });
  }

  private async flushSummary(orgId: string): Promise<void> {
    if (!this.summaryPending.has(orgId)) {
      return;
    }
    this.summaryPending.delete(orgId);
    try {
      const summaries = await this.getOrgGitSummary.execute({ orgId });
      this.publish(orgId, summaries);
    } catch (err) {
      trace('git-watch-events', 'summary failed', { orgId, error: String(err) });
    }
  }

  private async flushFileStatus(orgId: string, sourceId: string): Promise<void> {
    if (!this.fileStatusPending.has(sourceId)) {
      return;
    }
    this.fileStatusPending.delete(sourceId);
    try {
      const status = await this.getGitFileStatus.execute({ orgId, sourceId });
      this.publishFileStatus({ orgId, sourceId, map: status.map, truncated: status.truncated });
    } catch (err) {
      trace('git-watch-events', 'file-status failed', { orgId, sourceId, error: String(err) });
    }
  }

  private resetTimer(
    timers: Map<string, ReturnType<typeof setTimeout>>,
    key: string,
    fire: () => void,
  ): void {
    const existing = timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        fire();
      }, DEBOUNCE_MS),
    );
  }
}
