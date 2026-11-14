import { parseTriggerTaskText, type TriggerTaskField } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { MessageSquareTextIcon, ZapIcon } from 'lucide-react';
import { AddonMark } from '@/features/manage-addons/addon-mark';
import { getActiveOrgId } from '@/shared/api/active-org';
import { orgAddonsQuery } from '@/shared/api/addons';
import { Badge } from '@/shared/ui/badge';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/shared/ui/hover-card';
import { ThreadMarkdown } from '../model/thread-markdown';
import { FeedNotice } from './feed-notice';

export function TriggerNotice({ text, threadId }: { text: string; threadId?: string }) {
  const view = parseTriggerTaskText(text);
  const orgId = getActiveOrgId();
  const addons = useQuery({
    ...orgAddonsQuery(orgId ?? ''),
    enabled: Boolean(orgId) && view !== null,
  });
  const addon = addons.data?.items.find((item) => item.addonId === view?.addonId);
  if (!view) {
    return (
      <div className="flex justify-end">
        <FeedNotice
          tone="accent"
          icon={ZapIcon}
          label="Trigger"
          className="max-w-[min(100%,36rem)]"
        >
          <p className="whitespace-pre-wrap text-sm">{text}</p>
        </FeedNotice>
      </div>
    );
  }
  return (
    <div className="flex w-full justify-end">
      <div className="w-full max-w-[min(100%,40rem)] overflow-hidden rounded-xl border border-border/70 bg-muted/20">
        <div className="flex flex-wrap items-center gap-2 border-border/50 border-b px-3 py-2">
          <AddonMark size="sm" icon={addon?.icon} color={addon?.color} />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-medium text-[13px]">
              {addon?.title ?? view.addonId ?? 'Add-on'}
            </span>
            <Badge
              variant="secondary"
              className="h-4 gap-1 px-1.5 py-0 font-normal text-[10px]"
              aria-label={`Trigger ${view.label || view.triggerId}`}
            >
              <ZapIcon className="size-2.5" />
              {view.label || view.triggerId}
            </Badge>
          </div>
          {view.instructions ? <InstructionsBadge text={view.instructions} /> : null}
        </div>
        <div className="flex flex-col gap-2 px-3 py-2.5">
          <p className="font-medium text-sm leading-snug">{view.title}</p>
          {view.fields.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {view.fields.map((field) => (
                <FieldChip key={`${field.label}:${field.value}`} field={field} />
              ))}
            </div>
          ) : null}
          {view.body ? (
            <div className="text-sm leading-relaxed">
              <ThreadMarkdown text={view.body} threadId={threadId} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FieldChip({ field }: { field: TriggerTaskField }) {
  const chip = (
    <Badge
      variant="outline"
      className="h-auto max-w-[18rem] gap-1 px-1.5 py-0.5 font-normal text-[10px]"
    >
      <span className="text-muted-foreground">{field.label}</span>
      <span className="truncate">{field.value}</span>
    </Badge>
  );
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          field.href ? (
            <a href={field.href} target="_blank" rel="noreferrer">
              {chip}
            </a>
          ) : (
            chip
          )
        }
      />
      <HoverCardContent
        side="bottom"
        align="start"
        className="max-w-80 p-2.5 text-[11px] leading-4"
      >
        <p className="mb-1 font-medium text-[12px]">{field.label}</p>
        <p className="whitespace-pre-wrap break-words text-muted-foreground">{field.value}</p>
        {field.href ? (
          <a
            href={field.href}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block truncate text-live hover:underline"
          >
            {field.href}
          </a>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}

function InstructionsBadge({ text }: { text: string }) {
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <Badge
            variant="secondary"
            className="h-4 cursor-default gap-1 px-1.5 py-0 font-normal text-[10px]"
            aria-label="Trigger instructions"
          >
            <MessageSquareTextIcon className="size-2.5" />
            Instructions
          </Badge>
        }
      />
      <HoverCardContent
        side="bottom"
        align="end"
        className="max-h-80 w-96 overflow-y-auto p-3 text-[11px] leading-4"
      >
        <p className="mb-1.5 font-medium text-[12px]">Instructions</p>
        <pre className="whitespace-pre-wrap font-sans text-muted-foreground">{text}</pre>
      </HoverCardContent>
    </HoverCard>
  );
}
