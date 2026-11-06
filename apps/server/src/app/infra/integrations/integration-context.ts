import type { Logger } from '@harnesys/brix';
import type { EventsWatchAutomationsFrame } from '@harnesys/studio-shared';
import type {
  AddonEvents,
  AddonLogger,
  AddonRunInput,
  AddonRunResult,
  AddonRuns,
  AddonThreads,
} from 'harnesys/integration';
import { requireRunAccepted } from '../../application/threads/run-accepted.ts';
import { mechanicalRunStart } from '../../application/threads/run-attribution.ts';
import type { SendThreadRunUseCase } from '../../application/threads/send-thread-run.use-case.ts';
import { insertAgentThread } from '../../application/threads/thread.helpers.ts';
import type { EventsWatchHubPort } from '../../domain/events-watch/events-watch-hub.port.ts';
import { RunConflictException } from '../../domain/thread/thread.error.ts';
import type { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import type { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';

export const AUTOMATIONS_EVENT_TOPIC = 'automations-changed';

export function createAddonThreads(
  deps: { threads: ThreadRepositoryPort; threadAgents: ThreadAgentRepositoryPort },
  orgId: string,
): AddonThreads {
  return {
    async create(input) {
      const now = new Date().toISOString();
      const thread = insertAgentThread(
        deps,
        {
          id: crypto.randomUUID(),
          orgId,
          title: input.title,
          kind: input.kind ?? 'chat',
          parentThreadId: null,
          forkAt: null,
          inheritedEventCount: 0,
          metadata: {},
          runProfileId: null,
          runDirectory: null,
          createdAt: now,
          updatedAt: now,
          lastReadAt: now,
        },
        input.agentId,
      );
      return { threadId: thread.id };
    },
    async rename(threadId, title) {
      deps.threads.updateTitle(orgId, threadId, title);
    },
  };
}

export function createAddonRuns(
  deps: { sendThreadRun: SendThreadRunUseCase },
  orgId: string,
  logger: AddonLogger,
): AddonRuns {
  return {
    async dispatch(input: AddonRunInput): Promise<AddonRunResult> {
      try {
        requireRunAccepted(
          await deps.sendThreadRun.execute({
            orgId,
            threadId: input.threadId,
            body: {
              text: input.text,
              mode: input.modeId,
              correlationId: input.fireId,
            },
            attribution: mechanicalRunStart(null),
            trigger: { kind: 'connector', id: input.fireId },
            expiresAt: input.expiresAt ?? null,
          }),
        );
        return 'fired';
      } catch (error) {
        if (error instanceof RunConflictException) {
          return 'busy';
        }
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`integration run dispatch failed: ${message}`, {
          threadId: input.threadId,
          fireId: input.fireId,
        });
        return 'failed';
      }
    },
  };
}

export function createAddonEvents(hub: EventsWatchHubPort, orgId: string): AddonEvents {
  return {
    emit(input) {
      const frame: EventsWatchAutomationsFrame = {
        orgId,
        type: AUTOMATIONS_EVENT_TOPIC,
        kind: input.kind,
        action: input.action,
      };
      hub.publish(orgId, AUTOMATIONS_EVENT_TOPIC, frame);
    },
  };
}

export function createAddonLogger(logger: Logger, integrationId: string): AddonLogger {
  const child = logger.child(`integration:${integrationId}`);
  return {
    debug: (message, fields) => {
      child.debug(fields ?? {}, message);
    },
    info: (message, fields) => {
      child.info(fields ?? {}, message);
    },
    warn: (message, fields) => {
      child.warn(fields ?? {}, message);
    },
    error: (message, fields) => {
      child.error(fields ?? {}, message);
    },
  };
}
