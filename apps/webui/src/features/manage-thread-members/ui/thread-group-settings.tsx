import { DEFAULT_CONTEXT_WINDOW } from '@harnesys/contracts';
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

export function ThreadGroupSettings({ thread }: { thread: Thread }) {
  const { openDesk, openThread } = useStudioNavigation();
  const policy = thread.policy;
  const members = thread.members ?? [];
  const [contextWindow, setContextWindow] = useState(
    String(policy?.contextWindow ?? DEFAULT_CONTEXT_WINDOW),
  );
  const autoReplyFieldId = useId();
  const contextWindowFieldId = useId();
  const saveContextWindow = () => {
    const value = Number(contextWindow);
    void mutateThread(() =>
      updateThreadPolicy(thread.id, {
        contextWindow: Number.isFinite(value) && value > 0 ? value : DEFAULT_CONTEXT_WINDOW,
      }),
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
          title: 'Could not delete group',
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
            aria-label="Group settings"
            title="Group settings"
          />
        }
      >
        <Settings2Icon />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4 p-3">
        <p className="font-medium text-sm">Group settings</p>
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
        <Field>
          <FieldLabel htmlFor={contextWindowFieldId}>Context window</FieldLabel>
          <div className="flex items-center gap-1.5">
            <Input
              id={contextWindowFieldId}
              type="number"
              min={1}
              className="h-7 text-xs"
              value={contextWindow}
              placeholder={String(DEFAULT_CONTEXT_WINDOW)}
              onChange={(event) => setContextWindow(event.target.value)}
            />
            <Button type="button" size="sm" variant="secondary" onClick={saveContextWindow}>
              Save
            </Button>
          </div>
          <FieldDescription>
            How many recent messages each agent receives. Default {DEFAULT_CONTEXT_WINDOW}.
          </FieldDescription>
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
      </PopoverContent>
    </Popover>
  );
}
