import type { HookRunReport, RunEventFeed, RunEventStore } from 'harnesys';
import type { HookRunStorePort } from '../../domain/agent/hook-run-store.port.ts';

export function createHookReport(input: {
  orgId: string;
  hookRuns: HookRunStorePort;
  events: RunEventStore;
  feed: RunEventFeed;
}): (report: HookRunReport) => void {
  return (report: HookRunReport): void => {
    try {
      input.hookRuns.record(input.orgId, {
        agentId: report.agentId ?? '',
        hookId: report.hookId,
        event: report.event,
        handlerType: report.handlerType,
        status: report.status,
        durationMs: report.durationMs,
        ...(report.summary !== undefined ? { summary: report.summary } : {}),
        ...(report.errorCode !== undefined ? { errorCode: report.errorCode } : {}),
        effects: report.effects,
        ...(report.runId !== undefined ? { runId: report.runId } : {}),
        ...(report.threadId !== undefined ? { threadId: report.threadId } : {}),
      });
    } catch {
      // запись в hook_runs не должна ронять прогон
    }
    publishHookEvent(input, report);
  };
}

function publishHookEvent(
  input: { events: RunEventStore; feed: RunEventFeed },
  report: HookRunReport,
): void {
  const runId = report.runId;
  const threadId = report.threadId;
  if (runId === undefined || threadId === undefined) {
    return;
  }
  try {
    void Promise.resolve(
      input.events.appendForThread(threadId, runId, [
        {
          type: 'hook',
          hookId: report.hookId,
          event: report.event,
          status: report.status,
          handlerType: report.handlerType,
          ...(report.summary !== undefined ? { summary: report.summary } : {}),
          durationMs: report.durationMs,
        },
      ]),
    ).then((stored) => input.feed.publish(runId, stored));
  } catch {
    // публикация события не должна ронять прогон
  }
}
