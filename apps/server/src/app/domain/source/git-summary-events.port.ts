import type { EventsWatchGitSummaryFrame, GitSourceSummary } from '@harnesys/studio-shared';

export abstract class GitSummaryEventsPort {
  abstract subscribe(listener: (frame: EventsWatchGitSummaryFrame) => void): () => void;

  abstract publish(orgId: string, summaries: GitSourceSummary[]): void;
}
