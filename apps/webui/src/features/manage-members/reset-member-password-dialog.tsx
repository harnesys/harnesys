import { useState } from 'react';
import { type ResetMemberPasswordResult, resetMemberPassword } from '@/shared/api/members';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { dialog } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { toast } from '@/shared/ui/toast';

interface ResetTarget {
  userId: string;
  name: string;
  login: string;
}

export function openResetMemberPasswordDialog(
  orgId: string,
  member: ResetTarget,
): Promise<ResetMemberPasswordResult | null> {
  return dialog.open<ResetMemberPasswordResult, { orgId: string; member: ResetTarget }>(
    ResetMemberPasswordDialog,
    {
      title: `Reset password for ${member.name}?`,
      description: 'A new one-time password is shown once. Their sessions are revoked immediately.',
      data: { orgId, member },
      className: 'sm:max-w-md',
    },
  );
}

function ResetMemberPasswordDialog({
  onResolve,
  data,
}: DialogComponentProps<ResetMemberPasswordResult, { orgId: string; member: ResetTarget }>) {
  const orgId = data?.orgId ?? '';
  const member = data?.member;
  const [result, setResult] = useState<ResetMemberPasswordResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy || !member) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setResult(await resetMemberPassword(orgId, member.userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed');
    } finally {
      setBusy(false);
    }
  };

  if (result && member) {
    return (
      <>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Tell {member.name} (login <span className="font-mono">{member.login}</span>) to sign in
          with this password and set a new one. It is shown only once.
        </p>
        <code
          className="select-all rounded-md bg-muted px-3 py-2 font-mono text-sm"
          data-testid="reset-password-value"
        >
          {result.temporaryPassword}
        </code>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(result.temporaryPassword);
              toast.add({ title: 'Password copied' });
            }}
            data-testid="reset-password-copy"
          >
            Copy password
          </Button>
          <Button
            type="button"
            onClick={() => onResolve?.(result)}
            data-testid="reset-password-done"
          >
            Done
          </Button>
        </DialogFooter>
      </>
    );
  }
  return (
    <>
      <p className="text-muted-foreground text-sm leading-relaxed">
        The current password stops working immediately and all active sessions of this member are
        revoked.
      </p>
      {error ? (
        <p className="text-destructive text-sm" data-testid="reset-password-error">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={busy}
          onClick={() => void submit()}
          data-testid="reset-password-confirm"
        >
          {busy ? 'Resetting...' : 'Reset password'}
        </Button>
      </DialogFooter>
    </>
  );
}
