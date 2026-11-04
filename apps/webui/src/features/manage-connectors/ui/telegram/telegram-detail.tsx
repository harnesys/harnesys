import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { RowListSkeleton } from '@/shared/ui/settings-kit';
import {
  orgConnectorsBaseKey,
  orgConnectorsQuery,
  orgThreadsQueryKey,
} from '../../model/connector-api';
import { TelegramBotSection } from './telegram-bot-section';
import { TelegramHowItWorks } from './telegram-how-it-works';
import type { PairInfo } from './telegram-status';

export function TelegramDetail({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const prefillThreadId = searchParams.get('threadId');
  const connectors = useQuery(orgConnectorsQuery(orgId, { provider: 'telegram' }));
  const [pairByConnector] = useState<Record<string, PairInfo>>({});
  const items = connectors.data?.items ?? [];

  async function invalidate(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orgConnectorsBaseKey(orgId) }),
      queryClient.invalidateQueries({ queryKey: orgThreadsQueryKey(orgId) }),
    ]);
  }

  if (connectors.isPending) {
    return <RowListSkeleton testId="telegram-detail-loading" />;
  }

  return (
    <div className="flex flex-col gap-6" data-testid="telegram-detail">
      <TelegramHowItWorks />
      {prefillThreadId ? (
        <p className="rounded-md border border-dashed px-3 py-2 text-[13px] text-muted-foreground">
          Choose a chat below and connect this thread to it.
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm" data-testid="telegram-no-bots">
          No bots yet. Create one with @BotFather and add its token below.
        </p>
      ) : null}
      <TelegramBotSection
        orgId={orgId}
        connectors={items}
        pairByConnector={pairByConnector}
        initialThreadId={prefillThreadId}
        onChanged={() => void invalidate()}
      />
    </div>
  );
}
