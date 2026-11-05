import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';
import { attachChat } from '../../model/connector-api';

export function TelegramRegisterChat({
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
      toast.add({ title: 'Chat registered', description: 'Connect it to a thread next.' });
    },
    onError: (error: unknown) => {
      toast.add({
        title: 'Could not register the chat',
        description: error instanceof Error ? error.message : 'Request failed',
      });
    },
  });

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="self-start text-muted-foreground"
        data-testid="telegram-register-chat-open"
        onClick={() => setOpen(true)}
      >
        Register a chat manually
      </Button>
    );
  }
  return (
    <form
      className="flex flex-col gap-2 rounded-md border border-dashed p-2.5"
      data-testid="telegram-register-chat"
      onSubmit={(event) => {
        event.preventDefault();
        if (chatId.trim()) {
          mutation.mutate();
        }
      }}
    >
      <Field className="gap-1">
        <FieldLabel htmlFor={`register-chat-${connectorId}`}>Chat id or @username</FieldLabel>
        <Input
          id={`register-chat-${connectorId}`}
          value={chatId}
          placeholder="@my_group or -1001234567890"
          onChange={(event) => setChatId(event.target.value)}
        />
      </Field>
      <div className="flex gap-2">
        <Input
          value={topicId}
          aria-label="Topic id"
          placeholder="Topic id (optional)"
          onChange={(event) => setTopicId(event.target.value)}
        />
        <Input
          value={title}
          aria-label="Display name"
          placeholder="Display name (optional)"
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <p className="text-[11px] text-muted-foreground leading-4">
        Used only when a chat does not appear on its own. Public groups and channels accept their
        @username. Private ones have no username: open the chat in Telegram Web and copy the number
        from the address bar.
      </p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!chatId.trim() || mutation.isPending}>
          Register
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
