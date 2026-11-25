import { CheckIcon, Settings2Icon, Trash2Icon } from 'lucide-react';
import { useId, useState } from 'react';
import type { Thread } from '@/entities/thread';
import { useIdeStore } from '@/features/ide';
import { closeThread, confirmDeleteThread } from '@/features/switch-thread';
import { updateThreadMeta } from '@/shared/api';
import { useStudioNavigation } from '@/shared/config/navigation';
import { Button } from '@/shared/ui/button';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { InputGroupButton } from '@/shared/ui/input-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { ThreadColorPicker, ThreadIconPicker } from '@/shared/ui/thread-appearance-picker';
import { toast } from '@/shared/ui/toast';
import { mutateThread } from '../model/thread-members-mutation';
import { DownloadThreadDiagnostics } from './download-thread-diagnostics';
import { ThreadContextFiles } from './thread-context-files';
import { ThreadMemberList } from './thread-member-list';
import {
  AutoReplyAgentField,
  HistoryAnchorField,
  HistoryModeField,
  MentionGatingField,
  ResponderModeField,
} from './thread-settings-fields';

export function ThreadSettings({ thread, className }: { thread: Thread; className?: string }) {
  const isGroup = thread.kind === 'group';
  const canDelete = thread.kind === 'chat' || isGroup;
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
      <PopoverContent align="start" side="top" className="w-96 space-y-4 p-3">
        <p className="font-medium text-sm">Thread settings</p>
        <TitleField thread={thread} />
        {isGroup ? (
          <section className="space-y-2">
            <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
              Members
            </p>
            <ThreadMemberList thread={thread} />
          </section>
        ) : null}
        {isGroup ? <AppearanceField thread={thread} /> : null}
        <ThreadContextFiles thread={thread} />
        <HistoryModeField thread={thread} />
        <HistoryAnchorField thread={thread} />
        <ResponderModeField thread={thread} />
        {isGroup ? <AutoReplyAgentField thread={thread} /> : null}
        {isGroup ? <MentionGatingField thread={thread} /> : null}
        <DownloadThreadDiagnostics thread={thread} />
        {canDelete ? <DeleteThreadButton thread={thread} isGroup={isGroup} /> : null}
      </PopoverContent>
    </Popover>
  );
}

function TitleField({ thread }: { thread: Thread }) {
  const titleFieldId = useId();
  const [title, setTitle] = useState(thread.title);
  const trimmedTitle = title.trim();
  const titleChanged = trimmedTitle.length > 0 && trimmedTitle !== thread.title;
  const saveTitle = () => {
    if (!titleChanged) {
      return;
    }
    void mutateThread(() => updateThreadMeta(thread.id, { title: trimmedTitle }));
  };
  return (
    <Field>
      <FieldLabel htmlFor={titleFieldId}>Title</FieldLabel>
      <div className="flex items-center gap-1.5">
        <Input
          id={titleFieldId}
          type="text"
          className="h-7 text-xs"
          value={title}
          maxLength={120}
          placeholder="Thread title"
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              saveTitle();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          className="size-7"
          aria-label="Save title"
          title="Save title"
          disabled={!titleChanged}
          data-testid="thread-title-save"
          onClick={saveTitle}
        >
          <CheckIcon className="size-3" />
        </Button>
      </div>
    </Field>
  );
}

function AppearanceField({ thread }: { thread: Thread }) {
  return (
    <section className="space-y-2">
      <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        Appearance
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <ThreadIconPicker
          value={thread.icon ?? null}
          onChange={(icon) => void mutateThread(() => updateThreadMeta(thread.id, { icon }))}
        />
        <ThreadColorPicker
          value={thread.color ?? null}
          onChange={(color) => void mutateThread(() => updateThreadMeta(thread.id, { color }))}
        />
      </div>
    </section>
  );
}

function DeleteThreadButton({ thread, isGroup }: { thread: Thread; isGroup: boolean }) {
  const { openDesk, openThread } = useStudioNavigation();
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
  );
}
