import type { SessionEvent } from '@harnesys/studio-shared';
import { BACKGROUND_AGENT_ORIGIN, TRIGGER_HUMAN_ORIGIN } from '@harnesys/studio-shared';
import type { ReactNode } from 'react';
import { BackgroundReportSegment } from './background-report-segment';
import { TriggerNotice } from './trigger-notice';

export function originNoticeOf(
  event: SessionEvent & { type: 'user' },
  text: string,
  threadId?: string,
): ReactNode {
  if (event.origin === BACKGROUND_AGENT_ORIGIN) {
    return <BackgroundReportSegment text={text} threadId={threadId} />;
  }
  if (event.origin === TRIGGER_HUMAN_ORIGIN) {
    return <TriggerNotice text={text} threadId={threadId} />;
  }
  return null;
}
