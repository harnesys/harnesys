import { useQuery } from '@tanstack/react-query';
import { ExternalLinkIcon } from 'lucide-react';
import { useState } from 'react';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { formatDateTime } from '@/shared/lib/format-clock';
import { Button } from '@/shared/ui/button';
import { RowChip } from '@/shared/ui/capability-rows';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { SettingsEmpty, SettingsErrorBanner, SettingsSection } from '@/shared/ui/settings-kit';
import { listPosts } from '../api';
import { telegramSourcesQuery } from '../model/telegram-queries';
import type { TelegramPost, TelegramPostOutcome } from '../model/types';

const POSTS_LIMIT = 50;

const OUTCOME_LABELS: Record<TelegramPostOutcome, string> = {
  new: 'New',
  filtered: 'Filtered',
  fired: 'Fired',
  throttled: 'Throttled',
  over_limit: 'Over limit',
  error: 'Error',
};

const OUTCOME_TONES: Record<TelegramPostOutcome, 'neutral' | 'ok' | 'warn' | 'danger' | 'info'> = {
  new: 'info',
  filtered: 'neutral',
  fired: 'ok',
  throttled: 'warn',
  over_limit: 'warn',
  error: 'danger',
};

const OUTCOME_VALUES: TelegramPostOutcome[] = [
  'new',
  'filtered',
  'fired',
  'throttled',
  'over_limit',
  'error',
];

function postOutcome(value: string | null): TelegramPostOutcome | null {
  return OUTCOME_VALUES.find((item) => item === value) ?? null;
}

export function postsPanelQueryKey(orgId: string, sourceId: string, outcome: string) {
  return ['integrations', 'telegram', 'posts', orgId, sourceId, outcome] as const;
}

export function TelegramPostsPanel({ orgId }: { orgId: string }) {
  const [sourceId, setSourceId] = useState('all');
  const [outcome, setOutcome] = useState('all');
  const timeZone = useOrgTimeZone();
  const sources = useQuery(telegramSourcesQuery(orgId));
  const outcomeFilter = postOutcome(outcome);
  const posts = useQuery({
    queryKey: postsPanelQueryKey(orgId, sourceId, outcome),
    queryFn: () =>
      listPosts(orgId, {
        ...(sourceId === 'all' ? {} : { sourceId }),
        ...(outcomeFilter ? { outcome: outcomeFilter } : {}),
        limit: POSTS_LIMIT,
      }),
    enabled: Boolean(orgId),
  });
  const items = posts.data ?? [];
  const sourceItems = [
    { value: 'all', label: 'All sources' },
    ...(sources.data ?? []).map((source) => ({ value: source.id, label: source.title })),
  ];
  const outcomeItems = [
    { value: 'all', label: 'All outcomes' },
    ...OUTCOME_VALUES.map((item) => ({ value: item, label: OUTCOME_LABELS[item] })),
  ];
  return (
    <SettingsSection
      label="Latest posts"
      description="What the reader account has been seeing lately."
      testId="telegram-posts-panel"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Filter by source"
            items={sourceItems}
            value={sourceId}
            onValueChange={(value) => {
              if (typeof value === 'string') {
                setSourceId(value);
              }
            }}
          >
            <SelectTrigger className="h-7 w-40" data-testid="telegram-posts-source-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {sourceItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            aria-label="Filter by outcome"
            items={outcomeItems}
            value={outcome}
            onValueChange={(value) => {
              if (typeof value === 'string') {
                setOutcome(value);
              }
            }}
          >
            <SelectTrigger className="h-7 w-36" data-testid="telegram-posts-outcome-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {outcomeItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={posts.isFetching}
            onClick={() => void posts.refetch()}
            data-testid="telegram-posts-refresh"
          >
            {posts.isFetching ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      }
    >
      {posts.error ? (
        <SettingsErrorBanner message={posts.error.message} testId="telegram-posts-error" />
      ) : null}
      {posts.isPending ? (
        <p className="px-2 py-3 text-[13px] text-muted-foreground">Loading posts...</p>
      ) : null}
      {!posts.isPending && items.length === 0 ? (
        <SettingsEmpty
          title="No posts yet"
          description="Posts appear here after the reader account starts watching the sources."
          testId="telegram-posts-empty"
        />
      ) : null}
      {!posts.isPending && items.length > 0 ? (
        <div className="flex flex-col gap-1.5" data-testid="telegram-posts-list">
          {items.map((post) => (
            <PostRow key={post.id} post={post} timeZone={timeZone} />
          ))}
        </div>
      ) : null}
    </SettingsSection>
  );
}

function PostRow({ post, timeZone }: { post: TelegramPost; timeZone: string }) {
  return (
    <div
      className="flex flex-col gap-1 rounded-lg border bg-popover px-3 py-2"
      data-testid={`telegram-post-${post.id}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 truncate font-medium text-[13px]">{post.sourceTitle}</span>
        <RowChip tone={OUTCOME_TONES[post.outcome]}>{OUTCOME_LABELS[post.outcome]}</RowChip>
        <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
          {formatDateTime(post.publishedAt, timeZone)}
        </span>
        {post.url ? (
          <a
            href={post.url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-status-info hover:text-status-info/80"
            aria-label={`Open post ${post.postId} in Telegram`}
          >
            <ExternalLinkIcon className="size-3.5" />
          </a>
        ) : null}
      </div>
      <p className="line-clamp-3 whitespace-pre-wrap break-words text-muted-foreground text-xs leading-4">
        {post.text.slice(0, 200)}
        {post.text.length > 200 ? '…' : ''}
      </p>
    </div>
  );
}
