import type { ThreadHistoryMode, ThreadKind } from '@harnesys/studio-shared';
import { Settings2Icon, Trash2Icon } from 'lucide-react';
import { useId, useState } from 'react';
import type { Thread } from '@/entities/thread';
import { useIdeStore } from '@/features/ide';
import { closeThread, confirmDeleteThread } from '@/features/switch-thread';
import { updateThreadPolicy } from '@/shared/api';
import { useStudioNavigation } from '@/shared/config/navigation';
import { Button } from '@/shared/ui/button';
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { InputGroupButton } from '@/shared/ui/input-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';
import { toast } from '@/shared/ui/toast';
import { mutateThread } from '../model/thread-members-mutation';
import { ThreadMemberList } from './thread-member-list';

const NONE = '__none__';
const HISTORY_LAST_PLACEHOLDER = 10;

const DEFAULT_HISTORY_MODE_BY_KIND: Record<ThreadKind, ThreadHistoryMode> = {
  chat: 'full',
  group: 'last',
  schedule: 'none',
  webhook: 'none',
  issue: 'full',
};

const HISTORY_MODE_ITEMS: { value: ThreadHistoryMode; label: string }[] = [
  { value: 'full', label: 'Full history' },
  { value: 'none', label: 'This run only' },
  { value: 'last', label: 'Last N runs' },
];

const RESPONDER_MODE_ITEMS: { value: 'auto' | 'mention'; label: string }[] = [
  { value: 'auto', label: 'Agent answers every message' },
  { value: 'mention', label: 'Only on @mentions' },
];

export function ThreadSettings({ thread, className }: { thread: Thread; className?: string }) {
  const { openDesk, openThread } = useStudioNavigation();
  const policy = thread.policy;
  const members = thread.members ?? [];
  const isGroup = thread.kind === 'group';
  const canDelete = thread.kind === 'chat' || isGroup;
  const historyMode = policy?.historyMode ?? DEFAULT_HISTORY_MODE_BY_KIND[thread.kind];
  const [historyLast, setHistoryLast] = useState(
    policy?.historyLast === undefined ? '' : String(policy.historyLast),
  );
  const [historyFromRunId, setHistoryFromRunId] = useState(policy?.historyFromRunId ?? '');
  const autoReplyFieldId = useId();
  const historyLastFieldId = useId();
  const anchorFieldId = useId();
  const saveHistoryLast = () => {
    const value = Number(historyLast);
    if (!Number.isInteger(value)) {
      return;
    }
    void mutateThread(() =>
      updateThreadPolicy(thread.id, {
        historyLast: value >= 0 && value <= 100 ? value : null,
      }),
    );
  };
  const saveAnchor = () => {
    const value = historyFromRunId.trim();
    void mutateThread(() =>
      updateThreadPolicy(thread.id, { historyFromRunId: value === '' ? null : value }),
    );
  };
  const removeThread = () => {
    void confirmDeleteThread(thread).then(async (confirmed) => {
      if (!confirmed) {
        return;
      }
      const projectId = thread.orgId;
      try {
        const next = await closeThread(thread.id);
        if (!projectId) {
          return;
        }
        useIdeStore.getState().closeByEntity(projectId, 'thread', thread.id);
        if (next) {
          openThread(projectId, next);
        } else {
          openDesk();
        }
      } catch (error) {
        toast.add({
          title: 'Could not delete thread',
          description: error instanceof Error ? error.message : 'Request failed',
        });
      }
    });
  };
  return (
    <Popover>
      <PopoverTrigger
        render={
          <InputGroupButton
            size="icon-xs"
            variant="ghost"
            aria-label="Thread settings"
            title="Thread settings"
            className={className}
          />
        }
      >
        <Settings2Icon />
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-72 space-y-4 p-3">
        <p className="font-medium text-sm">Thread settings</p>
        {isGroup ? (
          <section className="space-y-2">
            <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
              Members
            </p>
            <ThreadMemberList thread={thread} />
          </section>
        ) : null}
        <Field>
          <FieldLabel htmlFor="thread-history-mode">History</FieldLabel>
          <div className="flex items-center gap-1.5">
            <Select
              items={HISTORY_MODE_ITEMS}
              value={historyMode}
              onValueChange={(value) =>
                void mutateThread(() =>
                  updateThreadPolicy(thread.id, { historyMode: value as ThreadHistoryMode }),
                )
              }
            >
              <SelectTrigger id="thread-history-mode" size="sm" className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {HISTORY_MODE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {historyMode === 'last' ? (
              <Input
                id={historyLastFieldId}
                type="text"
                inputMode="numeric"
                aria-label="Runs included"
                className="h-7 w-12 px-1.5 text-center text-xs"
                value={historyLast}
                placeholder={String(HISTORY_LAST_PLACEHOLDER)}
                onChange={(event) => setHistoryLast(event.target.value.replace(/\D/g, ''))}
                onBlur={saveHistoryLast}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur();
                  }
                }}
              />
            ) : null}
          </div>
          <FieldDescription>
            Prior history seeded into each run. With Last N runs, the input sets how many recent
            runs carry forward (default {HISTORY_LAST_PLACEHOLDER}).
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="thread-responder-mode">Responder mode</FieldLabel>
          <Select
            items={RESPONDER_MODE_ITEMS}
            value={policy?.responderMode ?? (thread.kind === 'group' ? 'mention' : 'auto')}
            onValueChange={(value) =>
              void mutateThread(() =>
                updateThreadPolicy(thread.id, { responderMode: value as 'auto' | 'mention' }),
              )
            }
          >
            <SelectTrigger id="thread-responder-mode" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              {RESPONDER_MODE_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            Who answers unaddressed messages: the pinned agent (auto) or only @mentions (mention).
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={anchorFieldId}>History anchor</FieldLabel>
          <Input
            id={anchorFieldId}
            type="text"
            className="h-7 text-xs"
            value={historyFromRunId}
            placeholder="Run ID to start history from"
            onChange={(event) => setHistoryFromRunId(event.target.value)}
            onBlur={saveAnchor}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
            }}
          />
          <FieldDescription>
            Optional. Starts history at a specific run; falls back to the default if the run is
            gone.
          </FieldDescription>
        </Field>
        {isGroup ? (
          <>
            <Field>
              <FieldLabel htmlFor={autoReplyFieldId}>Auto-reply agent</FieldLabel>
              <Select
                items={[
                  { value: NONE, label: 'None — every agent decides' },
                  ...members.map((member) => ({ value: member.id, label: member.name })),
                ]}
                value={thread.autoReplyAgentId ?? NONE}
                onValueChange={(value) =>
                  void mutateThread(() =>
                    updateThreadPolicy(thread.id, {
                      autoReplyAgentId: value === NONE ? null : String(value),
                    }),
                  )
                }
              >
                <SelectTrigger id={autoReplyFieldId} size="sm" className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectItem value={NONE}>None — every agent decides</SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>Gets messages without a mention.</FieldDescription>
            </Field>
            <Field orientation="horizontal" className="items-start justify-between gap-3">
              <FieldContent>
                <FieldTitle>Ignore @mentions</FieldTitle>
                <FieldDescription>Every agent gets every message.</FieldDescription>
              </FieldContent>
              <Switch
                aria-label="Ignore mentions"
                checked={policy?.mentionGating ?? false}
                onCheckedChange={(checked) =>
                  void mutateThread(() => updateThreadPolicy(thread.id, { mentionGating: checked }))
                }
              />
            </Field>
          </>
        ) : null}
        {canDelete ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            aria-label={isGroup ? 'Delete group thread' : 'Delete thread'}
            title={isGroup ? 'Delete group thread' : 'Delete thread'}
            onClick={removeThread}
            className="w-full"
          >
            <Trash2Icon className="size-3" />
            {isGroup ? 'Delete Group' : 'Delete thread'}
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
