import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { watchAutomationsEvents } from '@/shared/api/events';
import {
  telegramReadersQuery,
  telegramReadersQueryKey,
  telegramSourcesQueryKey,
} from '../model/telegram-queries';
import { TelegramReaderCard } from './telegram-reader-card';
import { TelegramSourcesCard } from './telegram-sources-card';

export function TelegramAccountSettings({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const readers = useQuery(telegramReadersQuery(orgId));
  useEffect(() => {
    if (!orgId) {
      return;
    }
    return watchAutomationsEvents(orgId, () => {
      void queryClient.invalidateQueries({ queryKey: telegramReadersQueryKey(orgId) });
      void queryClient.invalidateQueries({ queryKey: telegramSourcesQueryKey(orgId) });
    });
  }, [orgId, queryClient]);
  const connected = (readers.data ?? []).some((reader) => reader.status === 'authorized');
  return (
    <div className="flex flex-col gap-6" data-testid="telegram-account-settings">
      <TelegramReaderCard orgId={orgId} />
      {connected ? <TelegramSourcesCard orgId={orgId} /> : null}
    </div>
  );
}
