import { DEFAULT_MODE, DEFAULT_MODE_ID } from '@harnesys/studio-shared';
import type { Agent } from '@/entities/agent';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import type { TelegramFeedDraft } from '../model/telegram-feed-draft';
import type { TelegramFeedHistory } from '../model/types';

const HISTORY_VALUES: TelegramFeedHistory[] = ['none', 'last'];
const HISTORY_LABELS: Record<TelegramFeedHistory, string> = {
  none: 'This post only',
  last: 'Last N posts',
};

export function TelegramFeedLimitsFields({
  agents,
  draft,
  onPatch,
}: {
  agents: Agent[];
  draft: TelegramFeedDraft;
  onPatch: (patch: Partial<TelegramFeedDraft>) => void;
}) {
  const agent = agents.find((item) => item.id === draft.agentId);
  const modeItems = [
    { value: DEFAULT_MODE_ID, label: DEFAULT_MODE.name },
    ...(agent?.modes ?? []).map((mode) => ({ value: mode.id, label: mode.name })),
  ];
  function setNumber(field: 'historyLast' | 'maxRunsPerDay' | 'throttleSec', raw: string): void {
    const next = Number(raw);
    if (!Number.isFinite(next)) {
      return;
    }
    const patch: Partial<TelegramFeedDraft> = {};
    patch[field] = Math.max(0, Math.floor(next));
    onPatch(patch);
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor="telegram-feed-history">History in the model</FieldLabel>
        <Select
          items={HISTORY_VALUES.map((item) => ({ value: item, label: HISTORY_LABELS[item] }))}
          value={draft.history}
          onValueChange={(value) => {
            if (value === 'none' || value === 'last') {
              onPatch({ history: value });
            }
          }}
        >
          <SelectTrigger id="telegram-feed-history" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {HISTORY_VALUES.map((item) => (
                <SelectItem key={item} value={item}>
                  {HISTORY_LABELS[item]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      {draft.history === 'last' ? (
        <Field>
          <FieldLabel htmlFor="telegram-feed-history-last">Posts</FieldLabel>
          <Input
            id="telegram-feed-history-last"
            type="number"
            min={1}
            max={100}
            value={draft.historyLast}
            onChange={(event) => setNumber('historyLast', event.target.value)}
          />
        </Field>
      ) : null}
      <Field>
        <FieldLabel htmlFor="telegram-feed-mode">Mode</FieldLabel>
        <Select
          items={modeItems}
          value={draft.modeId}
          onValueChange={(value) => {
            if (typeof value === 'string') {
              onPatch({ modeId: value });
            }
          }}
        >
          <SelectTrigger id="telegram-feed-mode" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {modeItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="telegram-feed-max-runs">Runs per day</FieldLabel>
        <Input
          id="telegram-feed-max-runs"
          type="number"
          min={1}
          max={500}
          value={draft.maxRunsPerDay}
          onChange={(event) => setNumber('maxRunsPerDay', event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="telegram-feed-throttle">Throttle, sec</FieldLabel>
        <Input
          id="telegram-feed-throttle"
          type="number"
          min={0}
          max={3600}
          value={draft.throttleSec}
          onChange={(event) => setNumber('throttleSec', event.target.value)}
        />
      </Field>
    </div>
  );
}
