import type {
  EventsWatchGitFileStatusFrame,
  EventsWatchGitSummaryFrame,
  GitSourceSummary,
} from '@harnesys/studio-shared';

export abstract class GitWatchEventsPort {
  abstract subscribe(listener: (frame: EventsWatchGitSummaryFrame) => void): () => void;

  abstract publish(orgId: string, summaries: GitSourceSummary[]): void;

  abstract subscribeFileStatus(
    listener: (frame: EventsWatchGitFileStatusFrame) => void,
  ): () => void;

  abstract publishFileStatus(frame: EventsWatchGitFileStatusFrame): void;
}
