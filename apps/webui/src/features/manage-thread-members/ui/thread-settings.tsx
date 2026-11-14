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
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';
import { toast } from '@/shared/ui/toast';
import { mutateThread } from '../model/thread-members-mutation';

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

function historyModeLabel(mode: ThreadHistoryMode): string {
  return HISTORY_MODE_ITEMS.find((item) => item.value === mode)?.label ?? mode;
}

export function ThreadSettings({ thread, className }: { thread: Thread; className?: string }) {
  const { openDesk, openThread } = useStudioNavigation();
  const policy = thread.policy;
  const members = thread.members ?? [];
  const isGroup = thread.kind === 'group';
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
    void mutateThread(() =>
      updateThreadPolicy(thread.id, {
        historyLast: Number.isInteger(value) && value >= 0 && value <= 100 ? value : null,
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
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Thread settings"
            title="Thread settings"
            className={className}
          />
        }
      >
        <Settings2Icon />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4 p-3">
        <p className="font-medium text-sm">Thread settings</p>
        <Field>
          <FieldLabel htmlFor="thread-history-mode">History</FieldLabel>
          <Select
            items={HISTORY_MODE_ITEMS}
            value={historyMode}
            onValueChange={(value) =>
              void mutateThread(() =>
                updateThreadPolicy(thread.id, { historyMode: value as ThreadHistoryMode }),
              )
            }
          >
            <SelectTrigger id="thread-history-mode" size="sm" className="w-full">
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
          <FieldDescription>
            How much prior history each run is seeded with. Default for this thread:{' '}
            {historyModeLabel(DEFAULT_HISTORY_MODE_BY_KIND[thread.kind]).toLowerCase()}.
          </FieldDescription>
        </Field>
        {historyMode === 'last' ? (
          <Field>
            <FieldLabel htmlFor={historyLastFieldId}>Runs included</FieldLabel>
            <div className="flex items-center gap-1.5">
              <Input
                id={historyLastFieldId}
                type="number"
                min={0}
                max={100}
                className="h-7 text-xs"
                value={historyLast}
                placeholder={String(HISTORY_LAST_PLACEHOLDER)}
                onChange={(event) => setHistoryLast(event.target.value)}
              />
              <Button type="button" size="sm" variant="secondary" onClick={saveHistoryLast}>
                Save
              </Button>
            </div>
            <FieldDescription>
              Number of recent runs carried into the next one. Default {HISTORY_LAST_PLACEHOLDER}.
            </FieldDescription>
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor={anchorFieldId}>History anchor</FieldLabel>
          <div className="flex items-center gap-1.5">
            <Input
              id={anchorFieldId}
              type="text"
              className="h-7 text-xs"
              value={historyFromRunId}
              placeholder="Run ID to start history from"
              onChange={(event) => setHistoryFromRunId(event.target.value)}
            />
            <Button type="button" size="sm" variant="secondary" onClick={saveAnchor}>
              Save
            </Button>
          </div>
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
              <FieldDescription>Messages without a mention go to this agent.</FieldDescription>
            </Field>
            <Field orientation="horizontal" className="items-start justify-between gap-3">
              <FieldContent>
                <FieldTitle>Ignore @mentions</FieldTitle>
                <FieldDescription>Every agent receives every message.</FieldDescription>
              </FieldContent>
              <Switch
                aria-label="Ignore mentions"
                checked={policy?.mentionGating ?? false}
                onCheckedChange={(checked) =>
                  void mutateThread(() => updateThreadPolicy(thread.id, { mentionGating: checked }))
                }
              />
            </Field>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              aria-label="Delete group thread"
              title="Delete group thread"
              onClick={removeThread}
              className="w-full"
            >
              <Trash2Icon className="size-3" />
              Delete Group
            </Button>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
