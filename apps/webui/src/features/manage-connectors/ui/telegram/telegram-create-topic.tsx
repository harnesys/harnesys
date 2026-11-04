import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';
import { createTopic } from '../../model/connector-api';

export function TelegramCreateTopic({
  orgId,
  connectorId,
  bindingId,
  onCreated,
}: {
  orgId: string;
  connectorId: string;
  bindingId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const mutation = useMutation({
    mutationFn: () => createTopic(orgId, connectorId, bindingId, name.trim()),
    onSuccess: () => {
      setName('');
      setOpen(false);
      onCreated();
      toast.add({ title: 'Topic created', description: 'Connect it to a thread next.' });
    },
    onError: (error: unknown) => {
      toast.add({
        title: 'Could not create the topic',
        description: error instanceof Error ? error.message : 'Request failed',
      });
    },
  });

  if (!open) {
    return (
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Create topic
      </Button>
    );
  }
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) {
          mutation.mutate();
        }
      }}
    >
      <Input
        value={name}
        placeholder="Topic name"
        autoFocus
        onChange={(event) => setName(event.target.value)}
      />
      <Button type="submit" size="sm" disabled={!name.trim() || mutation.isPending}>
        Create
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}
