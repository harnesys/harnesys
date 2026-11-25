import type { ThreadHistoryMode } from '@harnesys/studio-shared';
import { AnchorIcon, XIcon } from 'lucide-react';
import { useId, useState } from 'react';
import type { Thread } from '@/entities/thread';
import { updateThreadPolicy } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';
import { mutateThread, setThreadHistoryAnchor } from '../model/thread-members-mutation';

const NONE = '__none__';
const HISTORY_LAST_PLACEHOLDER = 10;

export const DEFAULT_HISTORY_MODE_BY_KIND = {
  chat: 'full',
  group: 'last',
  schedule: 'none',
  webhook: 'none',
  issue: 'full',
} as const;

const HISTORY_MODE_ITEMS: { value: ThreadHistoryMode; label: string }[] = [
  { value: 'full', label: 'Full history' },
  { value: 'none', label: 'This run only' },
  { value: 'last', label: 'Last N runs' },
];

const RESPONDER_MODE_ITEMS: { value: 'auto' | 'mention'; label: string }[] = [
  { value: 'auto', label: 'Agent answers every message' },
  { value: 'mention', label: 'Only on @mentions' },
];

export function HistoryModeField({ thread }: { thread: Thread }) {
  const policy = thread.policy;
  const anchored = Boolean(policy?.historyFromSeq ?? policy?.historyFromRunId);
  const [historyLast, setHistoryLast] = useState(
    policy?.historyLast === undefined ? '' : String(policy.historyLast),
  );
  const historyMode = policy?.historyMode ?? DEFAULT_HISTORY_MODE_BY_KIND[thread.kind];
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
  return (
    <Field>
      <FieldLabel htmlFor="thread-history-mode">History</FieldLabel>
      <div className="flex items-center gap-1.5">
        <Select
          items={HISTORY_MODE_ITEMS}
          value={historyMode}
          disabled={anchored}
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
            type="text"
            inputMode="numeric"
            aria-label="Runs included"
            className="h-7 w-12 px-1.5 text-center text-xs disabled:opacity-50"
            value={historyLast}
            placeholder={String(HISTORY_LAST_PLACEHOLDER)}
            disabled={anchored}
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
        {anchored
          ? 'Disabled while a history anchor is set. Clear the anchor to use these settings.'
          : `Prior history seeded into each run. With Last N runs, the input sets how many recent runs carry forward (default ${HISTORY_LAST_PLACEHOLDER}).`}
      </FieldDescription>
    </Field>
  );
}

export function ResponderModeField({ thread }: { thread: Thread }) {
  const defaultMode = thread.kind === 'group' ? 'mention' : 'auto';
  return (
    <Field>
      <FieldLabel htmlFor="thread-responder-mode">Responder mode</FieldLabel>
      <Select
        items={RESPONDER_MODE_ITEMS}
        value={thread.policy?.responderMode ?? defaultMode}
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
  );
}

export function HistoryAnchorField({ thread }: { thread: Thread }) {
  const anchored = Boolean(thread.policy?.historyFromSeq ?? thread.policy?.historyFromRunId);
  return (
    <Field>
      <FieldTitle>History anchor</FieldTitle>
      {anchored ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-live/35 bg-live/5 px-2 py-1.5">
          <span className="flex min-w-0 items-center gap-1.5 font-medium text-live text-xs">
            <AnchorIcon className="size-3.5 shrink-0" />
            <span className="truncate">Starts at an anchored message in the feed</span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:bg-transparent hover:text-foreground"
            aria-label="Clear history anchor"
            title="Clear history anchor"
            onClick={() => setThreadHistoryAnchor(thread.id, null)}
          >
            <XIcon />
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          Pin a message in the feed to start history from that run.
        </p>
      )}
      <FieldDescription>
        {anchored
          ? 'History is seeded from this message onwards. The History mode above is ignored while an anchor is set.'
          : 'Optional. The anchor overrides the History mode and lasts until you clear it.'}
      </FieldDescription>
    </Field>
  );
}

export function AutoReplyAgentField({ thread }: { thread: Thread }) {
  const autoReplyFieldId = useId();
  const members = thread.members ?? [];
  return (
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
  );
}

export function MentionGatingField({ thread }: { thread: Thread }) {
  return (
    <Field orientation="horizontal" className="items-start justify-between gap-3">
      <FieldContent>
        <FieldTitle>Ignore @mentions</FieldTitle>
        <FieldDescription>Every agent gets every message.</FieldDescription>
      </FieldContent>
      <Switch
        aria-label="Ignore mentions"
        checked={thread.policy?.mentionGating ?? false}
        onCheckedChange={(checked) =>
          void mutateThread(() => updateThreadPolicy(thread.id, { mentionGating: checked }))
        }
      />
    </Field>
  );
}
