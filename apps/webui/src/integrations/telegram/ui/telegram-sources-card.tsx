import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { RowChip } from '@/shared/ui/capability-rows';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import {
  RowListSkeleton,
  SettingsEmpty,
  SettingsErrorBanner,
  SettingsSection,
} from '@/shared/ui/settings-kit';
import { addSource, backfillSource, deleteSource } from '../api';
import { telegramSourcesQuery, telegramSourcesQueryKey } from '../model/telegram-queries';
import type { BackfillResult, TelegramSource } from '../model/types';

const PEER_PLACEHOLDER = '@username or https://t.me/channel';

export function TelegramSourcesCard({ orgId }: { orgId: string }) {
  const sources = useQuery(telegramSourcesQuery(orgId));
  const queryClient = useQueryClient();
  const [peer, setPeer] = useState('');
  const [invite, setInvite] = useState('');
  const [watchTopics, setWatchTopics] = useState(false);
  const [backfillResults, setBackfillResults] = useState<Record<string, BackfillResult>>({});

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: telegramSourcesQueryKey(orgId) });
  };

  const add = useMutation({
    mutationFn: () =>
      addSource(orgId, {
        peer: peer.trim(),
        ...(peer.includes('+') && invite.trim() ? { invite: invite.trim() } : {}),
        watchTopics,
      }),
    onSuccess: () => {
      setPeer('');
      setInvite('');
      setWatchTopics(false);
      invalidate();
    },
  });

  const backfill = useMutation({
    mutationFn: (sourceId: string) => backfillSource(orgId, sourceId, 50),
    onSuccess: (result, sourceId) => {
      setBackfillResults((current) => ({ ...current, [sourceId]: result }));
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (sourceId: string) => deleteSource(orgId, sourceId),
    onSuccess: (_result, sourceId) => {
      setBackfillResults((current) => {
        const next = { ...current };
        delete next[sourceId];
        return next;
      });
      invalidate();
    },
  });

  async function confirmRemove(source: TelegramSource): Promise<void> {
    const ok = await alert.confirm({
      title: `Forget ${source.title}?`,
      description:
        'The channel is removed from the feed and its stored posts are deleted. Threads and their history stay in Harnesys.',
      confirmText: 'Forget source',
      variant: 'destructive',
      testId: 'telegram-source-remove-dialog',
    });
    if (ok) {
      remove.mutate(source.id);
    }
  }

  const items = sources.data ?? [];
  const busy = add.isPending || backfill.isPending || remove.isPending;
  const firstError = add.error ?? backfill.error ?? remove.error;
  return (
    <SettingsSection
      label="Feed sources"
      description="Channels and chats this account reads. The account must be a member of private ones."
      testId="telegram-sources-card"
    >
      <div className="flex flex-col gap-3 rounded-xl border bg-popover p-4">
        {firstError ? (
          <SettingsErrorBanner message={firstError.message} testId="telegram-sources-error" />
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            placeholder={PEER_PLACEHOLDER}
            aria-label="Channel username or link"
            className="min-w-0 flex-1 font-mono"
            value={peer}
            disabled={add.isPending}
            onChange={(event) => setPeer(event.target.value)}
            data-testid="telegram-source-peer"
          />
          <Button
            type="button"
            size="sm"
            disabled={peer.trim().length < 2 || add.isPending}
            onClick={() => add.mutate()}
            data-testid="telegram-source-add"
          >
            {add.isPending ? 'Joining...' : 'Add source'}
          </Button>
        </div>
        {peer.includes('+') ? (
          <Input
            placeholder="Invite hash (private channel)"
            aria-label="Invite hash"
            className="font-mono"
            value={invite}
            disabled={add.isPending}
            onChange={(event) => setInvite(event.target.value)}
            data-testid="telegram-source-invite"
          />
        ) : null}
        <label
          htmlFor="telegram-source-watch-topics"
          className="flex cursor-pointer items-center gap-2 text-[13px]"
        >
          <Checkbox
            id="telegram-source-watch-topics"
            checked={watchTopics}
            disabled={add.isPending}
            onCheckedChange={(checked) => setWatchTopics(checked === true)}
          />
          Forum topics
        </label>
      </div>
      {sources.isPending ? <RowListSkeleton rows={2} testId="telegram-sources-loading" /> : null}
      {!sources.isPending && items.length === 0 ? (
        <SettingsEmpty
          title="No sources yet"
          description="Add a public channel by @username or a private one with an invite hash."
          testId="telegram-sources-empty"
        />
      ) : null}
      {!sources.isPending && items.length > 0 ? (
        <div className="flex flex-col gap-2" data-testid="telegram-sources-list">
          {items.map((source) => (
            <SourceRow
              key={source.id}
              source={source}
              backfill={backfillResults[source.id]}
              busy={busy}
              backfilling={backfill.isPending && backfill.variables === source.id}
              removing={remove.isPending && remove.variables === source.id}
              onBackfill={() => backfill.mutate(source.id)}
              onRemove={() => void confirmRemove(source)}
            />
          ))}
        </div>
      ) : null}
    </SettingsSection>
  );
}

function SourceRow({
  source,
  backfill,
  busy,
  backfilling,
  removing,
  onBackfill,
  onRemove,
}: {
  source: TelegramSource;
  backfill: BackfillResult | undefined;
  busy: boolean;
  backfilling: boolean;
  removing: boolean;
  onBackfill: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border bg-popover px-3 py-2"
      data-testid={`telegram-source-${source.id}`}
    >
      <span className="min-w-0 flex-1 truncate font-medium text-[13px]">{source.title}</span>
      <RowChip tone="neutral">{source.peerKind}</RowChip>
      {source.watchTopics ? <RowChip tone="info">Topics</RowChip> : null}
      {!source.joined ? <RowChip tone="warn">Not joined</RowChip> : null}
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
        #{source.lastPostId}
      </span>
      {backfill ? (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {`fetched ${backfill.fetched} · stored ${backfill.stored}`}
        </span>
      ) : null}
      {source.lastError ? (
        <span className="min-w-0 max-w-64 truncate text-[11px] text-destructive">
          {source.lastError}
        </span>
      ) : null}
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={busy}
          onClick={onBackfill}
          data-testid={`telegram-source-backfill-${source.id}`}
        >
          {backfilling ? 'Loading...' : 'Backfill'}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={busy}
          onClick={onRemove}
          data-testid={`telegram-source-delete-${source.id}`}
        >
          {removing ? 'Removing...' : 'Delete'}
        </Button>
      </div>
    </div>
  );
}
