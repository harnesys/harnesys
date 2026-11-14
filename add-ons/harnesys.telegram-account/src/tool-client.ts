import type { AddonContext } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { createCallQueue } from './call-queue.ts';
import { type FeedCredentials, feedCredentials } from './credentials.ts';
import { openFeedClient } from './mtproto.ts';
import type { FeedClient } from './telegram-types.ts';
import { mapTelegramError } from './tool-errors.ts';

const CONNECTION = 'telegram-user';

interface ClientHolder {
  key: string;
  client: FeedClient;
}

const queue = createCallQueue();
let holder: ClientHolder | null = null;

function clientKeyOf(accountId: string, credentials: FeedCredentials): string {
  return `${accountId}:${credentials.apiId}:${credentials.apiHash}:${credentials.session}`;
}

function closeQuietly(client: FeedClient): void {
  void client.close().catch(() => undefined);
}

async function boundClient(ctx: AddonContext): Promise<ClientHolder> {
  const accounts = await ctx.accounts.list(CONNECTION);
  const accountId = accounts[0]?.accountId ?? '';
  const credentials = await feedCredentials(ctx);
  const key = clientKeyOf(accountId, credentials);
  if (holder !== null) {
    if (holder.key === key) {
      return holder;
    }
    const previous = holder;
    holder = null;
    closeQuietly(previous.client);
  }
  const client = await openFeedClient(credentials);
  holder = { key, client };
  return holder;
}

export function withSharedClient<T>(
  ctx: AddonContext,
  run: (client: FeedClient) => Promise<T>,
): Promise<T> {
  return queue.run(async () => {
    const bound = await boundClient(ctx);
    try {
      return await run(bound.client);
    } catch (error) {
      if (error instanceof AddonError && error.reason === 'account_failed' && holder === bound) {
        holder = null;
        closeQuietly(bound.client);
      }
      throw mapTelegramError(error);
    }
  });
}
