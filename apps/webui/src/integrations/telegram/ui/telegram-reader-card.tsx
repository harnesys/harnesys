import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { RowChip } from '@/shared/ui/capability-rows';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { RowListSkeleton, SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { StatusDot } from '@/shared/ui/status-dot';
import { authorizeReader, createReader, deleteReader } from '../api';
import { telegramReadersQuery, telegramReadersQueryKey } from '../model/telegram-queries';
import type { TelegramReader } from '../model/types';

type ReaderStep = 'form' | 'code' | 'connected';

function stepOf(reader: TelegramReader | undefined): ReaderStep {
  if (!reader) {
    return 'form';
  }
  if (reader.status === 'authorized') {
    return 'connected';
  }
  if (reader.status === 'error' || !reader.loginPending) {
    return 'form';
  }
  return 'code';
}

export function TelegramReaderCard({ orgId }: { orgId: string }) {
  const readers = useQuery(telegramReadersQuery(orgId));
  if (readers.isPending) {
    return (
      <section className="flex min-w-0 flex-col gap-2" data-testid="telegram-reader-card">
        <RowListSkeleton rows={2} testId="telegram-reader-loading" />
      </section>
    );
  }
  const reader = readers.data?.length ? readers.data[readers.data.length - 1] : undefined;
  const step = stepOf(reader);
  return (
    <section className="flex min-w-0 flex-col gap-2" data-testid="telegram-reader-card">
      {step === 'connected' && reader ? <ConnectedReader orgId={orgId} reader={reader} /> : null}
      {step === 'code' && reader ? <ReaderCodeStep orgId={orgId} reader={reader} /> : null}
      {step === 'form' ? <ReaderConnectForm orgId={orgId} failed={reader} /> : null}
    </section>
  );
}

function ReaderConnectForm({ orgId, failed }: { orgId: string; failed?: TelegramReader }) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [phone, setPhone] = useState('');
  const canConnect =
    label.trim().length > 0 &&
    /^\d+$/.test(apiId.trim()) &&
    apiHash.trim().length === 32 &&
    phone.trim().length >= 6;
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: telegramReadersQueryKey(orgId) });
  };
  const connect = useMutation({
    mutationFn: () =>
      createReader(orgId, {
        label: label.trim(),
        apiId: Number(apiId),
        apiHash: apiHash.trim(),
        phone: phone.trim(),
      }),
    onSuccess: () => {
      setLabel('');
      setApiId('');
      setApiHash('');
      setPhone('');
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (readerId: string) => deleteReader(orgId, readerId),
    onSuccess: invalidate,
  });
  const error = connect.error ?? remove.error;
  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-popover p-4">
      {failed ? (
        <SettingsErrorBanner
          message={
            failed.lastError ??
            'The previous login attempt did not finish. Press Connect to start again.'
          }
          testId="telegram-reader-login-error"
        />
      ) : null}
      {error ? (
        <SettingsErrorBanner message={error.message} testId="telegram-reader-connect-error" />
      ) : null}
      <p className="text-muted-foreground text-xs leading-4">
        Create an app at my.telegram.org, then paste the Api ID and Api hash here.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field className="gap-1.5">
          <FieldLabel htmlFor="telegram-reader-label">Name</FieldLabel>
          <Input
            id="telegram-reader-label"
            placeholder="Work account"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </Field>
        <Field className="gap-1.5">
          <FieldLabel htmlFor="telegram-reader-phone">Phone number</FieldLabel>
          <Input
            id="telegram-reader-phone"
            type="tel"
            autoComplete="off"
            placeholder="+1 555 000 1122"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </Field>
        <Field className="gap-1.5">
          <FieldLabel htmlFor="telegram-reader-api-id">API ID</FieldLabel>
          <Input
            id="telegram-reader-api-id"
            type="number"
            min={1}
            placeholder="1234567"
            value={apiId}
            onChange={(event) => setApiId(event.target.value)}
          />
        </Field>
        <Field className="gap-1.5">
          <FieldLabel htmlFor="telegram-reader-api-hash">API hash</FieldLabel>
          <Input
            id="telegram-reader-api-hash"
            type="password"
            autoComplete="off"
            className="font-mono"
            placeholder="0123456789abcdef0123456789abcdef"
            value={apiHash}
            onChange={(event) => setApiHash(event.target.value)}
          />
        </Field>
      </div>
      <div className="flex items-center justify-between gap-2">
        {failed ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate(failed.id)}
          >
            Remove failed account
          </Button>
        ) : (
          <span />
        )}
        <Button
          type="button"
          size="sm"
          disabled={!canConnect || connect.isPending}
          onClick={() => connect.mutate()}
          data-testid="telegram-reader-connect"
        >
          {connect.isPending ? 'Sending code...' : 'Connect'}
        </Button>
      </div>
    </article>
  );
}

function ReaderCodeStep({ orgId, reader }: { orgId: string; reader: TelegramReader }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: telegramReadersQueryKey(orgId) });
  };
  const authorize = useMutation({
    mutationFn: () =>
      authorizeReader(orgId, {
        readerId: reader.id,
        code: code.trim(),
        ...(password.trim() ? { password: password.trim() } : {}),
      }),
    onSuccess: () => {
      setCode('');
      setPassword('');
      invalidate();
    },
  });
  const cancel = useMutation({
    mutationFn: () => deleteReader(orgId, reader.id),
    onSuccess: invalidate,
  });
  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-popover p-4">
      <div className="flex items-center gap-2">
        <StatusDot tone="wait" label="Awaiting login" />
        <span className="min-w-0 flex-1 truncate font-medium text-sm">{reader.label}</span>
        <span className="shrink-0 font-mono text-muted-foreground text-xs">
          {reader.phoneMasked}
        </span>
      </div>
      {reader.status !== 'awaiting_password' ? (
        <p className="text-muted-foreground text-xs">
          A code was requested for{' '}
          <span className="font-mono">{reader.loginPhone ?? reader.phoneMasked}</span>. Telegram
          delivers it inside the Telegram app of that account — a message from the official Telegram
          service, not SMS. Enter it below.
        </p>
      ) : null}
      {reader.status === 'awaiting_password' ? (
        <p className="text-muted-foreground text-xs">
          Code accepted. This account has two-factor protection, enter its password.
        </p>
      ) : null}
      {authorize.error ? (
        <SettingsErrorBanner
          message={authorize.error.message}
          testId="telegram-reader-authorize-error"
        />
      ) : null}
      {cancel.error ? (
        <SettingsErrorBanner message={cancel.error.message} testId="telegram-reader-cancel-error" />
      ) : null}
      <Field className="gap-1.5">
        <FieldLabel htmlFor="telegram-reader-code">Login code</FieldLabel>
        <Input
          id="telegram-reader-code"
          autoComplete="one-time-code"
          inputMode="numeric"
          placeholder="12345"
          value={code}
          disabled={authorize.isPending}
          onChange={(event) => setCode(event.target.value)}
        />
      </Field>
      {reader.status === 'awaiting_password' ? (
        <Field className="gap-1.5">
          <FieldLabel htmlFor="telegram-reader-password">Two-factor password</FieldLabel>
          <Input
            id="telegram-reader-password"
            type="password"
            autoComplete="off"
            value={password}
            disabled={authorize.isPending}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
      ) : null}
      <div className="flex items-center justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={cancel.isPending}
          onClick={() => cancel.mutate()}
          data-testid="telegram-reader-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={code.trim().length === 0 || authorize.isPending}
          onClick={() => authorize.mutate()}
          data-testid="telegram-reader-confirm"
        >
          {authorize.isPending ? 'Confirming...' : 'Confirm'}
        </Button>
      </div>
    </article>
  );
}

function ConnectedReader({ orgId, reader }: { orgId: string; reader: TelegramReader }) {
  const queryClient = useQueryClient();
  const disconnect = useMutation({
    mutationFn: () => deleteReader(orgId, reader.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: telegramReadersQueryKey(orgId) });
    },
  });
  async function confirmDisconnect(): Promise<void> {
    const ok = await alert.confirm({
      title: `Disconnect ${reader.label}?`,
      description:
        'The login session is forgotten and feed automations read nothing until you connect again. Threads and their history stay in Harnesys.',
      confirmText: 'Disconnect',
      variant: 'destructive',
      testId: 'telegram-reader-disconnect-dialog',
    });
    if (ok) {
      disconnect.mutate();
    }
  }
  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-popover p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 truncate font-medium text-sm">{reader.label}</span>
        <RowChip tone="ok">Connected</RowChip>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={disconnect.isPending}
            onClick={() => void confirmDisconnect()}
            data-testid="telegram-reader-disconnect"
          >
            Disconnect
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground text-xs">
        <span className="font-mono">{reader.phoneMasked}</span>
        <span>{reader.dcId === null ? 'No DC yet' : `DC ${reader.dcId}`}</span>
      </div>
      {reader.lastError ? (
        <SettingsErrorBanner message={reader.lastError} testId="telegram-reader-last-error" />
      ) : null}
      {disconnect.error ? (
        <SettingsErrorBanner
          message={disconnect.error.message}
          testId="telegram-reader-disconnect-error"
        />
      ) : null}
    </article>
  );
}
