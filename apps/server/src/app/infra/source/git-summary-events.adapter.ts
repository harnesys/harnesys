import { Injectable } from '@harnesys/brix';
import type { EventsWatchGitSummaryFrame, GitSourceSummary } from '@harnesys/studio-shared';
import { GetOrgGitSummaryUseCase } from '../../application/source/get-org-git-summary.use-case.ts';
import { GitSummaryEventsPort } from '../../domain/source/git-summary-events.port.ts';
import { SourceWatchEventsPort } from '../../domain/source/source-watch-events.port.ts';
import { trace } from '../../libs/trace.ts';

const DEBOUNCE_MS = 300;

@Injectable()
export class GitSummaryEventsAdapter extends GitSummaryEventsPort {
  private readonly listeners = new Set<(frame: EventsWatchGitSummaryFrame) => void>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pending = new Set<string>();

  constructor(
    private readonly sourceWatchEvents: SourceWatchEventsPort,
    private readonly getOrgGitSummary: GetOrgGitSummaryUseCase,
  ) {
    super();
    this.sourceWatchEvents.subscribe((frame) => {
      const orgId = frame.orgId;
      this.pending.add(orgId);
      const existing = this.timers.get(orgId);
      if (existing) {
        clearTimeout(existing);
      }
      const timer = setTimeout(async () => {
        this.timers.delete(orgId);
        if (!this.pending.has(orgId)) {
          return;
        }
        this.pending.delete(orgId);
        try {
          const summaries = await this.getOrgGitSummary.execute({ orgId });
          this.publish(orgId, summaries);
        } catch (err) {
          trace('git-summary-events', 'summary failed', { orgId, error: String(err) });
        }
      }, DEBOUNCE_MS);
      this.timers.set(orgId, timer);
    });
  }

  publish(orgId: string, summaries: GitSourceSummary[]): void {
    const frame: EventsWatchGitSummaryFrame = { orgId, summaries };
    for (const listener of [...this.listeners]) {
      try {
        listener(frame);
      } catch (err) {
        trace('git-summary-events', 'listener error', { error: String(err) });
      }
    }
  }

  subscribe(listener: (frame: EventsWatchGitSummaryFrame) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
