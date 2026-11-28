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
import { withIdentitySqlite } from './identity-sqlite-session.ts';

@Injectable()
export class IdentityLinkAdapter extends IdentityLinkRepository {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  link(input: LinkIdentityInput): IdentityLinkRecord {
    return withIdentitySqlite(this.layout, (db) =>
      db.transaction((tx) => {
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
      }),
    );
  }

  findByIdentity(provider: string, providerUserId: string): IdentityLinkRecord | null {
    return withIdentitySqlite(this.layout, (db) => {
      const row = db
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
    });
  }

  findForUser(userId: string, provider: string): IdentityLinkRecord | null {
    return withIdentitySqlite(this.layout, (db) => {
      const row = db
        .select()
        .from(identityLinks)
        .where(and(eq(identityLinks.userId, userId), eq(identityLinks.provider, provider)))
        .get();
      return row ? { ...row } : null;
    });
  }

  listByUser(userId: string): IdentityLinkRecord[] {
    return withIdentitySqlite(this.layout, (db) =>
      db
        .select()
        .from(identityLinks)
        .where(eq(identityLinks.userId, userId))
        .all()
        .map((row) => ({ ...row })),
    );
  }

  unlink(userId: string, provider: string): void {
    withIdentitySqlite(this.layout, (db) => {
      db.delete(identityLinks)
        .where(and(eq(identityLinks.userId, userId), eq(identityLinks.provider, provider)))
        .run();
    });
  }

  issueCode(input: IssueIdentityLinkCodeInput): void {
    withIdentitySqlite(this.layout, (db) => {
      db.transaction((tx) => {
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
    });
  }

  consumeCode(input: ConsumeIdentityLinkCodeInput): ConsumedIdentityLinkCode | null {
    return withIdentitySqlite(this.layout, (db) => {
      const row = db
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
    });
  }
}
