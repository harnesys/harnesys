import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { watchConnectorChanges } from '@/shared/api';
import { RowListSkeleton } from '@/shared/ui/settings-kit';
import {
  orgConnectorsBaseKey,
  orgConnectorsQuery,
  orgThreadsQueryKey,
} from '../../model/connector-api';
import { TelegramBotSection } from './telegram-bot-section';
import { TelegramIdentityCard } from './telegram-identity-card';
import { TelegramSetupSteps } from './telegram-setup-steps';

export function TelegramDetail({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const prefillThreadId = searchParams.get('threadId');
  const connectors = useQuery(orgConnectorsQuery(orgId, { provider: 'telegram' }));
  const items = connectors.data?.items ?? [];

  async function invalidate(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orgConnectorsBaseKey(orgId) }),
      queryClient.invalidateQueries({ queryKey: orgThreadsQueryKey(orgId) }),
    ]);
  }

  useEffect(() => {
    return watchConnectorChanges(orgId, () => {
      void queryClient.invalidateQueries({ queryKey: orgConnectorsBaseKey(orgId) });
      void queryClient.invalidateQueries({ queryKey: orgThreadsQueryKey(orgId) });
    });
  }, [orgId, queryClient]);

  if (connectors.isPending) {
    return <RowListSkeleton testId="telegram-detail-loading" />;
  }

  return (
    <div className="flex flex-col gap-6" data-testid="telegram-detail">
      <TelegramSetupSteps connectors={items} />
      <TelegramIdentityCard botUsername={items[0]?.botUsername} />
      {prefillThreadId ? (
        <p className="rounded-md border border-dashed px-3 py-2 text-[13px] text-muted-foreground">
          Pick a chat below and connect this thread to it. Chats of another kind are offered only
          when the thread can be converted.
        </p>
      ) : null}
      <TelegramBotSection
        orgId={orgId}
        connectors={items}
        initialThreadId={prefillThreadId}
        onChanged={() => void invalidate()}
      />
    </div>
  );
}
