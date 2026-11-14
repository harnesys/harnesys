import { type AddonContext, AddonError } from '@harnesys/sdk';

export interface FeedCredentials {
  apiId: number;
  apiHash: string;
  session: string;
}

function readString(source: unknown, key: string): string | null {
  if (typeof source !== 'object' || source === null) {
    return null;
  }
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export async function feedCredentials(ctx: AddonContext): Promise<FeedCredentials> {
  const { credentials, app } = await ctx.accounts.access('telegram-user');
  const session = readString(credentials, 'session');
  if (session === null) {
    throw new AddonError('account_failed', {
      detail: 'the bound telegram-user account has no session; reconnect the account',
    });
  }
  const apiId = app === null || app === undefined ? null : app.values.apiId;
  const apiHash = app === null || app === undefined ? null : app.credentials.apiHash;
  if (typeof apiId !== 'number' || apiId <= 0 || typeof apiHash !== 'string' || apiHash === '') {
    throw new AddonError('account_failed', {
      detail: 'the telegram-user account has no usable telegram-app credentials',
    });
  }
  return { apiId, apiHash, session };
}
