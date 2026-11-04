import type { AcceptedRunResponse, RunAcceptedResponse } from '@harnesys/contracts';
import { ThreadInvariantException } from '../../domain/thread/thread.error.ts';

export function requireRunAccepted(response: AcceptedRunResponse): RunAcceptedResponse {
  if (response.status === 'stored') {
    throw new ThreadInvariantException('send stored the message without starting a run', {
      threadId: response.threadId,
      reason: response.reason,
    });
  }
  return response;
}
