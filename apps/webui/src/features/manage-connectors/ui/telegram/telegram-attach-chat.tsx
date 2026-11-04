import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';
import { attachChat } from '../../model/connector-api';

export function TelegramAttachChat({
  orgId,
  connectorId,
  onAttached,
}: {
  orgId: string;
  connectorId: string;
  onAttached: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [chatId, setChatId] = useState('');
  const [topicId, setTopicId] = useState('');
  const [title, setTitle] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      attachChat(orgId, connectorId, {
        chatId: chatId.trim(),
        ...(topicId.trim() ? { topicId: topicId.trim() } : {}),
        ...(title.trim() ? { title: title.trim() } : {}),
      }),
    onSuccess: () => {
      setChatId('');
      setTopicId('');
      setTitle('');
      setOpen(false);
      onAttached();
      toast.add({ title: 'Chat added', description: 'Connect it to a thread next.' });
    },
    onError: (error: unknown) => {
      toast.add({
        title: 'Could not add the chat',
        description: error instanceof Error ? error.message : 'Request failed',
      });
    },
  });

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        data-testid="telegram-attach-chat-open"
        onClick={() => setOpen(true)}
      >
        Add chat by id
      </Button>
    );
  }
  return (
    <form
      className="flex flex-col gap-2 rounded-md border border-dashed p-2"
      data-testid="telegram-attach-chat"
      onSubmit={(event) => {
        event.preventDefault();
        if (chatId.trim()) {
          mutation.mutate();
        }
      }}
    >
      <Field className="gap-1">
        <FieldLabel htmlFor={`attach-chat-${connectorId}`}>Chat id or @username</FieldLabel>
        <Input
          id={`attach-chat-${connectorId}`}
          value={chatId}
          placeholder="-1001234567890 or @my_group"
          onChange={(event) => setChatId(event.target.value)}
        />
      </Field>
      <div className="flex gap-2">
        <Input
          value={topicId}
          placeholder="Topic id (optional)"
          onChange={(event) => setTopicId(event.target.value)}
        />
        <Input
          value={title}
          placeholder="Title (optional)"
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Private groups have no username: copy the numeric id with a helper bot, or send a message in
        the group and refresh.
      </p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!chatId.trim() || mutation.isPending}>
          Add
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
