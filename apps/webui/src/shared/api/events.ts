import type {
  DeskEvent,
  EventsWatchApprovalFrame,
  EventsWatchDeskFrame,
  EventsWatchFleetFrame,
  EventsWatchIndexStateFrame,
  EventsWatchMaterializationFrame,
  EventsWatchReleaseFrame,
  EventsWatchSkillsFrame,
  EventsWatchSourceChangeFrame,
  EventsWatchThreadErrorEvent,
  EventsWatchThreadErrorFrame,
  KnowledgeIndexState,
} from '@harnesys/studio-shared';
import { env } from '@/shared/config/env';
import { watchEventSource } from './sse';

const eventsWatchUrl = `${env.localHostOrigin}/api/events/watch`;

export function watchDeskEvents(onEvent: (orgId: string, event: DeskEvent) => void): () => void {
  return watchEventSource(eventsWatchUrl, 'desk', (data) => {
    try {
      const frame = JSON.parse(data) as EventsWatchDeskFrame;
      onEvent(frame.orgId, frame.event);
    } catch {
      // ignore malformed frames
    }
  });
}

export function watchApprovalEvents(
  onEvent: (orgId: string, frame: EventsWatchApprovalFrame) => void,
): () => void {
  return watchEventSource(eventsWatchUrl, 'approval', (data) => {
    try {
      const frame = JSON.parse(data) as EventsWatchApprovalFrame;
      onEvent(frame.orgId, frame);
    } catch {
      // ignore malformed frames
    }
  });
}

export function watchThreadErrors(
  onEvent: (orgId: string, event: EventsWatchThreadErrorEvent) => void,
): () => void {
  return watchEventSource(eventsWatchUrl, 'thread-error', (data) => {
    try {
      const frame = JSON.parse(data) as EventsWatchThreadErrorFrame;
      onEvent(frame.orgId, frame.event);
    } catch {
      // ignore malformed frames
    }
  });
}

export function watchSourceChanges(
  onEvent: (frame: EventsWatchSourceChangeFrame) => void,
): () => void {
  return watchEventSource(eventsWatchUrl, 'source-change', (data) => {
    try {
      onEvent(JSON.parse(data) as EventsWatchSourceChangeFrame);
    } catch {
      // ignore malformed frames
    }
  });
}

export function watchSkillsChanged(onEvent: (frame: EventsWatchSkillsFrame) => void): () => void {
  return watchEventSource(eventsWatchUrl, 'skills-changed', (data) => {
    try {
      onEvent(JSON.parse(data) as EventsWatchSkillsFrame);
    } catch {
      // ignore malformed frames
    }
  });
}

export function watchReleaseAvailable(
  onEvent: (frame: EventsWatchReleaseFrame) => void,
): () => void {
  return watchEventSource(eventsWatchUrl, 'release-available', (data) => {
    try {
      onEvent(JSON.parse(data) as EventsWatchReleaseFrame);
    } catch {
      // ignore malformed frames
    }
  });
}

export function watchKnowledgeIndexStates(
  onState: (sourceId: string, state: KnowledgeIndexState) => void,
): () => void {
  return watchEventSource(eventsWatchUrl, 'index-state', (data) => {
    try {
      const frame = JSON.parse(data) as EventsWatchIndexStateFrame;
      onState(frame.sourceId, frame.state);
    } catch {
      // ignore malformed frames
    }
  });
}

export function watchFleetChanged(
  orgId: string,
  onEvent: () => void,
  options?: { onOpen?: () => void; onError?: () => void },
): () => void {
  return watchEventSource(
    eventsWatchUrl,
    'fleet-changed',
    (data) => {
      try {
        const frame = JSON.parse(data) as EventsWatchFleetFrame;
        if (frame.orgId === orgId) {
          onEvent();
        }
      } catch {
        // ignore malformed frames
      }
    },
    options,
  );
}

export function watchMaterializationChanged(
  orgId: string,
  onEvent: (frame: EventsWatchMaterializationFrame) => void,
  options?: { onOpen?: () => void; onError?: () => void },
): () => void {
  return watchEventSource(
    eventsWatchUrl,
    'materialization-changed',
    (data) => {
      try {
        const frame = JSON.parse(data) as EventsWatchMaterializationFrame;
        if (frame.orgId === orgId) {
          onEvent(frame);
        }
      } catch {
        // ignore malformed frames
      }
    },
    options,
  );
}

export function watchKnowledgeIndexState(
  _orgId: string,
  sourceId: string,
  onState: (state: KnowledgeIndexState) => void,
): () => void {
  return watchKnowledgeIndexStates((frameSourceId, state) => {
    if (frameSourceId === sourceId) {
      onState(state);
    }
  });
}
