import {
  IdentityLinkCodeInvalidException,
  IdentityLinkConflictException,
} from '../../domain/identity/identity.error.ts';
import type { ConfirmIdentityLinkUseCase } from '../identity/confirm-identity-link.use-case.ts';
import {
  type ApplyActionContext,
  type ApplyActionDeps,
  replyText,
} from './apply-telegram-context.ts';

export async function applyIdentityLink(
  deps: ApplyActionDeps,
  confirmLink: ConfirmIdentityLinkUseCase,
  ctx: ApplyActionContext,
  code: string,
): Promise<void> {
  if (!ctx.chatId || ctx.update.kind !== 'command') {
    deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'rejected');
    return;
  }
  try {
    const linked = confirmLink.execute({
      provider: ctx.connector.provider,
      providerUserId: ctx.update.author.userId,
      providerDisplayName: ctx.update.author.displayName,
      providerHandle: ctx.update.author.username,
      code,
    });
    await replyText(deps, ctx, `Linked to ${linked.name}.`);
    deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'consumed');
  } catch (error) {
    if (
      error instanceof IdentityLinkCodeInvalidException ||
      error instanceof IdentityLinkConflictException
    ) {
      await replyText(deps, ctx, 'Link code is invalid or already used.');
      deps.connectors.markInbox(ctx.orgId, ctx.inboxId, 'rejected');
      return;
    }
    throw error;
  }
}
