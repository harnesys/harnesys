import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';
import { createTelegramBot } from '../../model/connector-api';

export function TelegramAddBotForm({ orgId, onCreated }: { orgId: string; onCreated: () => void }) {
  const [token, setToken] = useState('');
  const mutation = useMutation({
    mutationFn: () => createTelegramBot(orgId, token),
    onSuccess: (result) => {
      setToken('');
      onCreated();
      toast.add({
        title: `@${result.connector.botUsername} added`,
        description: 'Pair a direct message or add the bot to a group.',
      });
    },
    onError: (error: unknown) => {
      toast.add({
        title: 'Could not add the bot',
        description: error instanceof Error ? error.message : 'Request failed',
      });
    },
  });

  return (
    <form
      className="flex flex-col gap-2 rounded-lg border bg-popover p-3"
      data-testid="telegram-add-bot"
      onSubmit={(event) => {
        event.preventDefault();
        if (token.trim()) {
          mutation.mutate();
        }
      }}
    >
      <Field className="gap-1.5">
        <FieldLabel htmlFor="telegram-bot-token">Bot token</FieldLabel>
        <div className="flex gap-2">
          <Input
            id="telegram-bot-token"
            type="password"
            autoComplete="off"
            className="font-mono"
            placeholder="123456:ABC…"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={!token.trim() || mutation.isPending}>
            Add bot
          </Button>
        </div>
      </Field>
      <p className="text-[11px] text-muted-foreground">
        Create a bot with @BotFather and paste its token. Each bot can serve any thread in this
        organization.
      </p>
    </form>
  );
}
