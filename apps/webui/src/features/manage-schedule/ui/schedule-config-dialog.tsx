import { type AgentMode, DEFAULT_MODE, DEFAULT_MODE_ID } from '@harnesys/studio-shared';
import { useState } from 'react';
import type { Agent } from '@/entities/agent';
import { SCHEDULE_STATUSES, type Schedule, scheduleStatusLabel } from '@/entities/schedule';
import { ThreadBindingSelects, useThreadStore } from '@/entities/thread';
import { cn } from '@/shared/lib/utils';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { confirmDeleteSchedule } from '../model/delete-schedule';
import type { ScheduleConfigResult } from '../model/schedule-dialogs';
import { draftFrom, emptyScheduleDraft, type ScheduleFormDraft } from '../model/schedule-draft';
import { CronComposer } from './cron-composer';
import { ScheduleHistoryFields } from './schedule-history-fields';
import { ScheduleThreadField } from './schedule-thread-field';

interface AgentModesLike {
  modes?: AgentMode[];
  defaultModeId?: string | null;
}
function hasAgentModes(agent: Agent): agent is Agent & AgentModesLike {
  return 'modes' in agent;
}
export interface ScheduleConfigData {
  agents: Agent[];
  projectId: string;
  schedule: Schedule | null;
}
export function ScheduleConfigDialog({
  onResolve,
  data,
}: DialogComponentProps<ScheduleConfigResult, ScheduleConfigData>) {
  const agents = data?.agents ?? [];
  const projectId = data?.projectId ?? '';
  const schedule = data?.schedule ?? null;
  const [draft, setDraft] = useState<ScheduleFormDraft>(() => {
    if (schedule) {
      return draftFrom(schedule);
    }
    const base = emptyScheduleDraft(agents);
    const first = agents.find((item) => item.id === base.targetAgentId);
    const defaultModeId = first !== undefined && hasAgentModes(first) ? first.defaultModeId : null;
    return { ...base, modeId: defaultModeId ?? DEFAULT_MODE_ID };
  });
  const agent = agents.find((item) => item.id === draft.targetAgentId);
  const linkedThread = useThreadStore((state) =>
    draft.threadId ? state.items.find((item) => item.id === draft.threadId) : undefined,
  );
  const agentModes = agent !== undefined && hasAgentModes(agent) ? (agent.modes ?? []) : [];
  const modeItems = [
    { value: DEFAULT_MODE_ID, label: DEFAULT_MODE.name },
    ...agentModes.map((mode) => ({ value: mode.id, label: mode.name })),
  ];
  const canSave = draft.name.trim().length > 0 && draft.cron.trim().length > 0 && agents.length > 0;
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <FieldGroup>
          <Field data-invalid={draft.name.trim().length === 0 || undefined}>
            <FieldLabel htmlFor="schedule-name">Name</FieldLabel>
            <div
              className={cn(
                'grid items-start gap-1.5',
                schedule
                  ? 'sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]'
                  : 'sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]',
              )}
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">Name</span>
                <Input
                  id="schedule-name"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  placeholder="Nightly eval sweep"
                  aria-invalid={draft.name.trim().length === 0 || undefined}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">Agent</span>
                <Select
                  items={agents.map((agent) => ({ value: agent.id, label: agent.name }))}
                  value={draft.targetAgentId}
                  onValueChange={(value) => {
                    if (typeof value === 'string') {
                      const next = agents.find((item) => item.id === value);
                      const defaultModeId =
                        next !== undefined && hasAgentModes(next) ? next.defaultModeId : null;
                      setDraft({
                        ...draft,
                        targetAgentId: value,
                        threadId: schedule ? draft.threadId : '',
                        modeId: defaultModeId ?? DEFAULT_MODE_ID,
                      });
                    }
                  }}
                >
                  <SelectTrigger id="schedule-agent" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              {schedule ? (
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Status</span>
                  <Select
                    items={SCHEDULE_STATUSES.map((status) => ({
                      value: status,
                      label: scheduleStatusLabel(status),
                    }))}
                    value={draft.status}
                    onValueChange={(value) => {
                      if (value === 'active' || value === 'paused' || value === 'failed') {
                        setDraft({ ...draft, status: value });
                      }
                    }}
                  >
                    <SelectTrigger id="schedule-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {SCHEDULE_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {scheduleStatusLabel(status)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          </Field>
          {projectId ? (
            <Field>
              <FieldLabel>Wake thread</FieldLabel>
              <div className="grid items-start gap-1.5 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.5fr)]">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Thread</span>
                  <ScheduleThreadField
                    projectId={projectId}
                    agentId={draft.targetAgentId}
                    value={draft.threadId}
                    onChange={(threadId) => setDraft({ ...draft, threadId })}
                    currentThreadId={schedule?.threadId}
                    allowDedicated={!schedule}
                  />
                </div>
                {linkedThread ? (
                  <ThreadBindingSelects
                    orgId={projectId}
                    threadId={linkedThread.id}
                    runProfileId={linkedThread.runProfileId ?? null}
                    runDirectory={linkedThread.runDirectory ?? null}
                    bindingLocked={linkedThread.bindingLocked ?? false}
                  />
                ) : null}
              </div>
              <FieldDescription>
                {linkedThread
                  ? 'Profile and folder apply to the wake thread runs.'
                  : 'Dedicated thread is an isolated cron log. A chat thread receives the fire in that conversation.'}
              </FieldDescription>
            </Field>
          ) : null}
          {!linkedThread && draft.threadId ? (
            <FieldDescription>
              Binding can be set after the first run creates the thread.
            </FieldDescription>
          ) : null}
          <Field>
            <FieldLabel htmlFor="schedule-cron-raw">Cron</FieldLabel>
            <CronComposer value={draft.cron} onChange={(cron) => setDraft({ ...draft, cron })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="schedule-mode">Mode</FieldLabel>
              <Select
                items={modeItems}
                value={draft.modeId}
                onValueChange={(value) => {
                  if (typeof value === 'string') {
                    setDraft({ ...draft, modeId: value });
                  }
                }}
              >
                <SelectTrigger id="schedule-mode" className="w-full">
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
            <ScheduleHistoryFields
              history={draft.history}
              historyLast={draft.historyLast}
              onHistory={(history) => setDraft({ ...draft, history })}
              onHistoryLast={(historyLast) => setDraft({ ...draft, historyLast })}
            />
          </div>
          <Field>
            <FieldLabel htmlFor="schedule-detail">Notes</FieldLabel>
            <Textarea
              id="schedule-detail"
              value={draft.detail}
              onChange={(event) => setDraft({ ...draft, detail: event.target.value })}
              placeholder="Morning digest, nightly eval, weekend sweep…"
              className="min-h-24"
            />
          </Field>
        </FieldGroup>
      </div>
      <DialogFooter>
        {schedule ? (
          <Button
            variant="ghost"
            className="mr-auto text-destructive hover:text-destructive"
            data-testid="schedule-config-delete"
            onClick={() => {
              void confirmDeleteSchedule(schedule).then((confirmed) => {
                if (confirmed) {
                  onResolve?.({ draft: null, deleted: true });
                }
              });
            }}
          >
            Delete
          </Button>
        ) : null}
        <Button variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button disabled={!canSave} onClick={() => onResolve?.({ draft, deleted: false })}>
          Save
        </Button>
      </DialogFooter>
    </>
  );
}
