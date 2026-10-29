import { BadRequestException, Injectable } from '@harnesys/brix';
import type { GoogleOAuthStatusResponse } from '@harnesys/contracts';
import {
  type GoogleOAuthLoopbackPending,
  GoogleOAuthSessionStore,
} from '../../infra/integration/google/google-oauth-sessions.ts';

export interface PollGoogleOAuthInput {
  orgId: string;
  sessionId: string;
}

@Injectable()
export class PollGoogleOAuthUseCase {
  constructor(private readonly sessions: GoogleOAuthSessionStore) {}

  async execute(input: PollGoogleOAuthInput): Promise<GoogleOAuthStatusResponse> {
    const session = this.sessions.get(input.sessionId);
    if (!session || session.orgId !== input.orgId) {
      throw new BadRequestException('Unknown Google OAuth session');
    }
    if (session.status === 'ready') {
      return { status: 'ready', integrationId: session.integrationId ?? '' };
    }
    if (session.status === 'denied') {
      return { status: 'denied' };
    }
    if (session.status === 'expired') {
      return { status: 'expired' };
    }
    return this.loopbackStatus(input.sessionId, session);
  }

  private loopbackStatus(
    sessionId: string,
    session: GoogleOAuthLoopbackPending,
  ): GoogleOAuthStatusResponse {
    if (Date.now() >= session.expiresAt) {
      this.sessions.set(sessionId, { status: 'expired', orgId: session.orgId });
      return { status: 'expired' };
    }
    return { status: 'pending' };
  }
}
