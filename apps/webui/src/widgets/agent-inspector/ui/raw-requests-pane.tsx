import { queryOptions, useQuery } from '@tanstack/react-query';
import { ChevronRightIcon, DownloadIcon, RefreshCwIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useThreadStore } from '@/entities/thread';
import { useSelectedThread } from '@/features/desk';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import {
  getThreadRawModelRequest,
  listThreadRawModelRequests,
  type RawRequestCallPayload,
  type RawRequestCallSummary,
} from '@/shared/api/raw-model-requests';
import { formatClockSeconds } from '@/shared/lib/format-clock';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { Skeleton } from '@/shared/ui/skeleton';
import { CopyIconButton } from './copy-icon-button';
import { RawRequestDetail } from './raw-request-detail';
import { copyJson, downloadJson, requestTimestamp } from './raw-request-format';
import { Section, SectionEmpty } from './section';

const payloadOptions = (threadId: string, name: string) =>
  queryOptions({
    queryKey: ['threads', threadId, 'raw-model-requests', name],
    queryFn: () => getThreadRawModelRequest(threadId, name),
    staleTime: Number.POSITIVE_INFINITY,
  });

export function RawRequestsPane() {
  const thread = useSelectedThread();
  const threadId = thread?.id ?? null;
  const query = useQuery({
    queryKey: ['threads', threadId ?? '', 'raw-model-requests'],
    queryFn: () => listThreadRawModelRequests(threadId ?? ''),
    enabled: Boolean(threadId),
    retry: false,
  });
  const items = query.data ?? [];
  const [openName, setOpenName] = useState<string | null>(null);
  const exporting = useExportRequests(threadId);
  let body: ReactNode;
  if (!threadId) {
    body = <SectionEmpty>No thread selected.</SectionEmpty>;
  } else if (query.isPending) {
    body = <RequestSkeleton />;
  } else if (query.isError) {
    body = (
      <div className="flex flex-col items-start gap-1.5">
        <p className="text-[12px] text-destructive leading-snug">Could not load model requests.</p>
        <Button
          variant="outline"
          size="xs"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Retry
        </Button>
      </div>
    );
  } else if (items.length === 0) {
    body = <SectionEmpty>No model requests captured for this thread.</SectionEmpty>;
  } else {
    body = (
      <div className="flex flex-col gap-1.5">
        {items.map((item, index) => (
          <RequestCard
            key={item.name}
            item={item}
            index={index}
            threadId={threadId}
            open={openName === item.name}
            onOpenChange={(open) => setOpenName(open ? item.name : null)}
          />
        ))}
      </div>
    );
  }
  return (
    <Section
      label="Model requests"
      hint={items.length > 0 ? String(items.length) : undefined}
      action={
        <>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Export thread requests"
            title="Export requests"
            className="text-muted-foreground"
            disabled={!threadId || items.length === 0 || exporting.isPending}
            onClick={() => void exporting.run()}
          >
            <DownloadIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Refresh requests"
            title="Refresh"
            className="text-muted-foreground"
            disabled={!threadId || query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCwIcon className={cn(query.isFetching && 'animate-spin')} />
          </Button>
        </>
      }
    >
      {body}
    </Section>
  );
}

function RequestCard({
  item,
  index,
  threadId,
  open,
  onOpenChange,
}: {
  item: RawRequestCallSummary;
  index: number;
  threadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const timeZone = useOrgTimeZone();
  const stamp = requestTimestamp(item.name);
  const payload = useQuery({
    ...payloadOptions(threadId, item.name),
    enabled: open,
  });
  const usage = item.meta?.usage;
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className="group/request rounded-md border border-border/60"
    >
      <div className="flex items-center gap-1 rounded-md transition-colors hover:bg-muted/40">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left">
          <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-data-[open]/request:rotate-90" />
          <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
            {stamp === null ? item.name : formatClockSeconds(stamp, timeZone)}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60 tabular-nums">
            {item.meta?.model ?? `#${index + 1}`}
          </span>
          {typeof usage?.inputTokens === 'number' || typeof usage?.outputTokens === 'number' ? (
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60 tabular-nums">
              {usage?.inputTokens ?? 0}/{usage?.outputTokens ?? 0}
            </span>
          ) : null}
        </CollapsibleTrigger>
        <div className="hidden shrink-0 items-center gap-0.5 group-data-[open]/request:flex">
          <CopyIconButton
            label="Copy JSON"
            disabled={!payload.data}
            onCopy={() => copyJson(payload.data)}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Download call JSON"
            title="Download JSON"
            className="text-muted-foreground"
            disabled={!payload.data}
            onClick={() => downloadJson(item.name, payload.data)}
          >
            <DownloadIcon />
          </Button>
        </div>
      </div>
      <CollapsibleContent>
        <div className="border-border/60 border-t px-2 py-2">
          {payload.data ? (
            <RequestPayload payload={payload.data} />
          ) : (
            <Skeleton className="h-16 w-full" />
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function RequestPayload({ payload }: { payload: RawRequestCallPayload }) {
  const sections = payload.plan?.sections ?? [];
  return (
    <div className="flex flex-col gap-3">
      {sections.length > 0 ? (
        <div className="flex flex-col">
          <span className="font-mono text-[9px] text-muted-foreground/70 uppercase tracking-[0.12em]">
            Context sections
          </span>
          {sections.map((section) => (
            <div key={section.id} className="flex items-center justify-between gap-2 py-0.5">
              <span className="min-w-0 truncate font-mono text-[10px]" title={section.id}>
                {section.id}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60 tabular-nums">
                ~{section.estTokens} tok
              </span>
            </div>
          ))}
          <div className="mt-2 flex items-center justify-between gap-2 border-border/60 border-t pt-1">
            <span className="font-medium font-mono text-[10px]">Total</span>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
              ~{payload.plan?.totalEstTokens ?? 0} tok
            </span>
          </div>
        </div>
      ) : null}
      <RawRequestDetail body={payload.request} />
    </div>
  );
}

function useExportRequests(threadId: string | null) {
  const runId = useThreadStore((state) =>
    threadId ? state.byId(threadId)?.activeRun?.runId : null,
  );
  const [isPending, setIsPending] = useState(false);
  const run = async () => {
    if (!threadId) {
      return;
    }
    setIsPending(true);
    try {
      const summaries = await listThreadRawModelRequests(threadId);
      const calls = await Promise.all(
        summaries.map((item) => getThreadRawModelRequest(threadId, item.name)),
      );
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const suffix = runId ?? 'thread';
      downloadJson(`harnesys-${threadId}-${suffix}-${stamp}.json`, {
        threadId,
        ...(runId ? { runId } : {}),
        exportedAt: new Date().toISOString(),
        calls,
      });
    } finally {
      setIsPending(false);
    }
  };
  return { run, isPending };
}

function RequestSkeleton() {
  return (
    <div className="flex flex-col gap-1.5">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}
