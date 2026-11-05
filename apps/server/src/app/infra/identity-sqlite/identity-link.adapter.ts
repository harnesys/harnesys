import { Injectable } from '@harnesys/brix';
import { and, eq, gt, lte } from 'drizzle-orm';
import { IdentityLinkConflictException } from '../../domain/identity/identity.error.ts';
import {
  type ConsumedIdentityLinkCode,
  type ConsumeIdentityLinkCodeInput,
  type IdentityLinkRecord,
  IdentityLinkRepository,
  type IssueIdentityLinkCodeInput,
  type LinkIdentityInput,
} from '../../domain/identity/identity-link.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { identityLinkCodes, identityLinks } from './identity.schema.ts';
import { openIdentitySqlite } from './identity-sqlite-session.ts';

@Injectable()
export class IdentityLinkAdapter extends IdentityLinkRepository {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  link(input: LinkIdentityInput): IdentityLinkRecord {
    const sqlite = openIdentitySqlite(this.layout);
    try {
      return sqlite.db.transaction((tx) => {
        const byIdentity = tx
          .select()
          .from(identityLinks)
          .where(
            and(
              eq(identityLinks.provider, input.provider),
              eq(identityLinks.providerUserId, input.providerUserId),
            ),
          )
          .get();
        if (byIdentity && byIdentity.userId !== input.userId) {
          throw new IdentityLinkConflictException(input.provider);
        }
        const existing = tx
          .select()
          .from(identityLinks)
          .where(
            and(eq(identityLinks.userId, input.userId), eq(identityLinks.provider, input.provider)),
          )
          .get();
        if (existing) {
          tx.update(identityLinks)
            .set({
              providerUserId: input.providerUserId,
              displayName: input.displayName ?? null,
              handle: input.handle ?? null,
              updatedAt: input.at,
            })
            .where(
              and(
                eq(identityLinks.userId, input.userId),
                eq(identityLinks.provider, input.provider),
              ),
            )
            .run();
          return {
            userId: input.userId,
            provider: input.provider,
            providerUserId: input.providerUserId,
            displayName: input.displayName ?? null,
            handle: input.handle ?? null,
            createdAt: existing.createdAt,
            updatedAt: input.at,
          };
        }
        tx.insert(identityLinks)
          .values({
            userId: input.userId,
            provider: input.provider,
            providerUserId: input.providerUserId,
            displayName: input.displayName ?? null,
            handle: input.handle ?? null,
            createdAt: input.at,
            updatedAt: input.at,
          })
          .run();
        return {
          userId: input.userId,
          provider: input.provider,
          providerUserId: input.providerUserId,
          displayName: input.displayName ?? null,
          handle: input.handle ?? null,
          createdAt: input.at,
          updatedAt: input.at,
        };
      });
    } finally {
      sqlite.sqlite.close();
    }
  }

  findByIdentity(provider: string, providerUserId: string): IdentityLinkRecord | null {
    const sqlite = openIdentitySqlite(this.layout);
    try {
      const row = sqlite.db
        .select()
        .from(identityLinks)
        .where(
          and(
            eq(identityLinks.provider, provider),
            eq(identityLinks.providerUserId, providerUserId),
          ),
        )
        .get();
      return row ? { ...row } : null;
    } finally {
      sqlite.sqlite.close();
    }
  }

  findForUser(userId: string, provider: string): IdentityLinkRecord | null {
    const sqlite = openIdentitySqlite(this.layout);
    try {
      const row = sqlite.db
        .select()
        .from(identityLinks)
        .where(and(eq(identityLinks.userId, userId), eq(identityLinks.provider, provider)))
        .get();
      return row ? { ...row } : null;
    } finally {
      sqlite.sqlite.close();
    }
  }

  listByUser(userId: string): IdentityLinkRecord[] {
    const sqlite = openIdentitySqlite(this.layout);
    try {
      return sqlite.db
        .select()
        .from(identityLinks)
        .where(eq(identityLinks.userId, userId))
        .all()
        .map((row) => ({ ...row }));
    } finally {
      sqlite.sqlite.close();
    }
  }

  unlink(userId: string, provider: string): void {
    const sqlite = openIdentitySqlite(this.layout);
    try {
      sqlite.db
        .delete(identityLinks)
        .where(and(eq(identityLinks.userId, userId), eq(identityLinks.provider, provider)))
        .run();
    } finally {
      sqlite.sqlite.close();
    }
  }

  issueCode(input: IssueIdentityLinkCodeInput): void {
    const sqlite = openIdentitySqlite(this.layout);
    try {
      sqlite.db.transaction((tx) => {
        tx.delete(identityLinkCodes).where(lte(identityLinkCodes.expiresAt, input.at)).run();
        tx.delete(identityLinkCodes)
          .where(
            and(
              eq(identityLinkCodes.userId, input.userId),
              eq(identityLinkCodes.provider, input.provider),
            ),
          )
          .run();
        tx.insert(identityLinkCodes)
          .values({
            codeHash: input.codeHash,
            userId: input.userId,
            provider: input.provider,
            expiresAt: input.expiresAt,
            createdAt: input.at,
          })
          .run();
      });
    } finally {
      sqlite.sqlite.close();
    }
  }

  consumeCode(input: ConsumeIdentityLinkCodeInput): ConsumedIdentityLinkCode | null {
    const sqlite = openIdentitySqlite(this.layout);
    try {
      const row = sqlite.db
        .delete(identityLinkCodes)
        .where(
          and(
            eq(identityLinkCodes.provider, input.provider),
            eq(identityLinkCodes.codeHash, input.codeHash),
            gt(identityLinkCodes.expiresAt, input.at),
          ),
        )
        .returning({ userId: identityLinkCodes.userId })
        .get();
      return row ?? null;
    } finally {
      sqlite.sqlite.close();
    }
  }
}
