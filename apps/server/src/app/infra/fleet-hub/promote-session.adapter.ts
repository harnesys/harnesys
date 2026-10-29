import { Injectable } from '@harnesys/brix';
import {
  type PromoteSession,
  PromoteSessionStore,
} from '../../domain/fleet/promote-session.port.ts';

@Injectable()
export class PromoteSessionAdapter extends PromoteSessionStore {
  private readonly sessions = new Map<string, PromoteSession>();

  create(session: PromoteSession): void {
    this.sessions.set(session.token, session);
  }

  get(token: string): PromoteSession | null {
    const session = this.sessions.get(token);
    if (!session) {
      return null;
    }
    if (Date.parse(session.expiresAt) <= Date.now()) {
      this.sessions.delete(token);
      return null;
    }
    return session;
  }

  consume(token: string): PromoteSession | null {
    const session = this.get(token);
    if (!session) {
      return null;
    }
    this.sessions.delete(token);
    return session;
  }
}
