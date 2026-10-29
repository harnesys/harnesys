import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { notifySessionDead, sessionLogout } from '@/shared/api/session';
import {
  changePassword,
  type MySessionView,
  mySessionsQuery,
  mySessionsQueryKey,
  revokeAllMySessions,
  revokeMySession,
} from '@/shared/api/sessions';
import { formatDayTime } from '@/shared/lib/format-clock';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { Row, RowChip, RowHeader, RowList } from '@/shared/ui/capability-rows';
import { Input } from '@/shared/ui/input';
import {
  RowListSkeleton,
  SettingsEmpty,
  SettingsField,
  SettingsSave,
} from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';

export function AccountPane() {
  return (
    <div className="flex w-full flex-col gap-8" data-testid="account-pane">
      <PasswordSection />
      <SessionsSection />
    </div>
  );
}

function PasswordSection() {
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');

  const dirty = currentPassword.length > 0 || newPassword.length > 0 || repeatPassword.length > 0;
  const repeatInvalid = repeatPassword.length > 0 && repeatPassword !== newPassword;

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setRepeatPassword('');
  };

  const submit = useMutation({
    mutationFn: () => changePassword({ currentPassword, newPassword }),
    onSuccess: async () => {
      reset();
      await queryClient.invalidateQueries({ queryKey: mySessionsQueryKey() });
      toast.add({
        title: 'Password changed',
        description: 'Other devices were signed out.',
      });
    },
    onError: (err: Error) => {
      toast.add({ title: 'Password change failed', description: err.message });
    },
  });

  return (
    <section className="flex min-w-0 flex-col gap-2" data-testid="account-password">
      <RowHeader
        label="Password"
        description="Changing the password signs out all other sessions; this device stays signed in."
      />
      <SettingsField
        label="Current password"
        htmlFor="account-current-password"
        className="border-t"
      >
        <Input
          id="account-current-password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => {
            setCurrentPassword(event.target.value);
          }}
          data-testid="account-current-password"
        />
      </SettingsField>
      <SettingsField label="New password" htmlFor="account-new-password">
        <Input
          id="account-new-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => {
            setNewPassword(event.target.value);
          }}
          data-testid="account-new-password"
        />
      </SettingsField>
      <SettingsField
        label="Repeat new password"
        htmlFor="account-repeat-password"
        error={repeatInvalid ? 'Passwords do not match' : null}
      >
        <Input
          id="account-repeat-password"
          type="password"
          autoComplete="new-password"
          value={repeatPassword}
          onChange={(event) => {
            setRepeatPassword(event.target.value);
          }}
          data-testid="account-repeat-password"
        />
      </SettingsField>
      <div className="flex justify-end">
        <SettingsSave
          dirty={dirty}
          pending={submit.isPending}
          invalid={
            currentPassword.length === 0 ||
            newPassword.length === 0 ||
            repeatInvalid ||
            repeatPassword !== newPassword
          }
          saveLabel="Change password"
          pendingLabel="Changing..."
          onSave={() => {
            submit.mutate();
          }}
          onDiscard={reset}
          testId="account-password-save"
        />
      </div>
    </section>
  );
}

function SessionsSection() {
  const queryClient = useQueryClient();
  const query = useQuery(mySessionsQuery());
  const sessions = query.data ?? [];

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: mySessionsQueryKey() });
  };

  const revoke = useMutation({
    mutationFn: (familyId: string) => revokeMySession(familyId),
    onSuccess: async () => {
      await invalidate();
      toast.add({ title: 'Session revoked' });
    },
    onError: (err: Error) => {
      toast.add({ title: 'Revoking failed', description: err.message });
    },
  });

  const revokeAll = useMutation({
    mutationFn: async () => {
      await revokeAllMySessions();
      await sessionLogout();
    },
    onSuccess: () => {
      notifySessionDead();
    },
    onError: (err: Error) => {
      toast.add({ title: 'Sign out failed', description: err.message });
    },
  });

  const onRevokeAll = () => {
    void alert
      .confirm({
        title: 'Sign out everywhere?',
        description:
          'All sessions including this device are revoked. You will need to sign in again.',
        confirmText: 'Sign out everywhere',
        variant: 'destructive',
      })
      .then((ok) => {
        if (ok) {
          revokeAll.mutate();
        }
      });
  };

  return (
    <section className="flex min-w-0 flex-col gap-2" data-testid="account-sessions">
      <RowHeader label="My sessions" count={query.isPending ? undefined : sessions.length}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={revokeAll.isPending}
          onClick={onRevokeAll}
          data-testid="account-revoke-all"
        >
          Sign out everywhere
        </Button>
      </RowHeader>
      {query.isPending && <RowListSkeleton testId="account-sessions-loading" />}
      {!query.isPending && sessions.length === 0 ? (
        <SettingsEmpty
          testId="account-sessions-empty"
          title="No active sessions"
          description="Sessions appear here after you sign in."
        />
      ) : null}
      <RowList>
        {sessions.map((session) => (
          <SessionRow
            key={session.familyId}
            session={session}
            busy={revoke.isPending}
            onRevoke={() => {
              revoke.mutate(session.familyId);
            }}
          />
        ))}
      </RowList>
    </section>
  );
}

function SessionRow({
  session,
  busy,
  onRevoke,
}: {
  session: MySessionView;
  busy: boolean;
  onRevoke: () => void;
}) {
  const timeZone = useOrgTimeZone();
  return (
    <Row
      testId={`session-${session.familyId}`}
      title={session.familyId.slice(0, 8)}
      mono
      muted={session.current}
      chips={session.current ? <RowChip tone="accent">this device</RowChip> : null}
      summary={`Last active ${formatDayTime(session.lastUsedAt, timeZone)} · expires ${formatDayTime(
        session.absoluteExpiresAt,
        timeZone,
      )}`}
      actions={
        session.current ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            disabled={busy}
            aria-label="Revoke session"
            title="Revoke session"
            data-testid={`session-revoke-${session.familyId}`}
            onClick={onRevoke}
          >
            <Trash2Icon />
          </Button>
        )
      }
    />
  );
}
