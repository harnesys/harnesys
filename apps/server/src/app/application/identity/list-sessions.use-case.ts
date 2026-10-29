import { ForbiddenException, Injectable } from '@harnesys/brix';
import { type Principal } from '../../domain/identity/principal.ts';
import type { ActiveUserSessionRow } from '../../domain/identity/session-store.port.ts';
import { SessionStore } from '../../domain/identity/session-store.port.ts';
import { hashToken } from './hash-token.ts';

export interface SessionView {
  familyId: string;
  current: boolean;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  absoluteExpiresAt: string;
}

export function shapeSessionViews(
  rows: ActiveUserSessionRow[],
  currentFamilyId: string,
): SessionView[] {
  const views: SessionView[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.familyId)) {
      continue;
    }
    seen.add(row.familyId);
    views.push({
      familyId: row.familyId,
      current: row.familyId === currentFamilyId,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      expiresAt: row.expiresAt,
      absoluteExpiresAt: row.absoluteExpiresAt,
    });
  }
  return views;
}

export interface ListSessionsInput {
  principal: Principal;
  currentAccessToken: string;
}

@Injectable()
export class ListSessionsUseCase {
  constructor(private readonly sessions: SessionStore) {}

  async execute(input: ListSessionsInput): Promise<SessionView[]> {
    if (input.principal.kind !== 'user') {
      throw new ForbiddenException('A user session is required to list sessions');
    }
    const current = await this.currentFamilyId(input.currentAccessToken);
    return shapeSessionViews(this.sessions.listActiveByUser(input.principal.userId), current);
  }

  private async currentFamilyId(currentAccessToken: string): Promise<string> {
    const session = this.sessions.findByAccessHash(await hashToken(currentAccessToken));
    return session ? session.familyId : '';
  }
}
