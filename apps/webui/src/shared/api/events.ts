import type {
  DeskEvent,
  EventsWatchApprovalFrame,
  EventsWatchAutomationsFrame,
  EventsWatchConnectorFrame,
  EventsWatchDeskFrame,
  EventsWatchFleetFrame,
  EventsWatchIndexStateFrame,
  EventsWatchMaterializationFrame,
  EventsWatchReleaseFrame,
  EventsWatchResyncFrame,
  EventsWatchSkillsFrame,
  EventsWatchSourceChangeFrame,
  EventsWatchTerminalFrame,
  EventsWatchThreadErrorEvent,
  EventsWatchThreadErrorFrame,
  EventsWatchThreadEventsFrame,
  KnowledgeIndexState,
  TerminalWatchEvent,
} from '@harnesys/studio-shared';
import { env } from '@/shared/config/env';
import { watchEventSource } from './sse';

export { watchEventSource };

export const eventsWatchUrl = `${env.localHostOrigin}/api/events/watch`;

export function watchDeskEvents(orgId: string, onEvent: (event: DeskEvent) => void): () => void {
  return watchEventSource(
    eventsWatchUrl,
    'desk',
    (data) => {
      try {
        const frame = JSON.parse(data) as EventsWatchDeskFrame;
        if (frame.orgId && frame.orgId !== orgId) {
          return;
        }
        onEvent(frame.event);
      } catch {
        // ignore malformed frames
      }
    },
    { orgId },
  );
}

export function watchThreadEvents(
  orgId: string,
  onFrame: (frame: EventsWatchThreadEventsFrame) => void,
  options?: { onOpen?: () => void },
): () => void {
  return watchEventSource(
    eventsWatchUrl,
    'thread-events',
    (data) => {
      try {
        onFrame(JSON.parse(data) as EventsWatchThreadEventsFrame);
      } catch {
        // ignore malformed frames
      }
    },
    { orgId, ...(options?.onOpen === undefined ? {} : { onOpen: options.onOpen }) },
  );
}

export function watchResync(
  orgId: string,
  onResync: (frame: EventsWatchResyncFrame) => void,
): () => void {
  return watchEventSource(
    eventsWatchUrl,
    'resync',
    (data) => {
      try {
        onResync(JSON.parse(data) as EventsWatchResyncFrame);
      } catch {
        // ignore malformed frames
      }
    },
    { orgId },
  );
}

export function watchConnectorChanges(orgId: string, onChanged: () => void): () => void {
  return watchEventSource(eventsWatchUrl, 'connectors-changed', (data) => {
    try {
      const frame = JSON.parse(data) as EventsWatchConnectorFrame;
      if (frame.orgId === orgId) {
        onChanged();
      }
    } catch {
      // ignore malformed frames
    }
  });
}

export function watchAutomationsEvents(orgId: string, onChange: () => void): () => void {
  return watchEventSource(eventsWatchUrl, 'automations-changed', (data) => {
    try {
      const frame = JSON.parse(data) as EventsWatchAutomationsFrame;
      if (frame.orgId === orgId) {
        onChange();
      }
    } catch {
      // ignore malformed frames
    }
  });
}

export function watchTerminalEvents(
  onEvent: (orgId: string, frame: TerminalWatchEvent) => void,
): () => void {
  return watchEventSource(eventsWatchUrl, 'terminal', (data) => {
    try {
      const frame = JSON.parse(data) as EventsWatchTerminalFrame;
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
