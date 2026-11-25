import { CopyIcon } from 'lucide-react';
import { useState } from 'react';
import {
  INVITE_PRESETS,
  type IssuedMemberInvite,
  issueMemberInvite,
  type MemberCapability,
} from '@/shared/api/members';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { dialog } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { toast } from '@/shared/ui/toast';
import {
  type MemberRole,
  membershipRole,
  ROLE_LABELS,
  roleCapabilities,
} from './model/member-access';
import { inviteAcceptUrl } from './model/member-invites';
import { CapabilityChecklist, RolePicker } from './ui/capability-form';

export function openInviteMemberDialog(orgId: string): Promise<IssuedMemberInvite | null> {
  return dialog.open(InviteMemberDialog, {
    title: 'Invite member',
    description: 'The invite link works once and expires in 24 hours.',
    data: { orgId },
    layoutKey: 'invite-member',
    className: 'max-h-[calc(100vh-4rem)] overflow-y-auto sm:max-w-lg',
  });
}

function InviteMemberDialog({
  onResolve,
  data,
}: DialogComponentProps<IssuedMemberInvite, { orgId: string }>) {
  const orgId = data?.orgId ?? '';
  const [capabilities, setCapabilities] = useState<readonly MemberCapability[]>([
    ...INVITE_PRESETS.operator,
  ]);
  const [issued, setIssued] = useState<IssuedMemberInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const role = membershipRole(capabilities);

  const choosePreset = (next: MemberRole) => {
    setCapabilities([...roleCapabilities(next)]);
  };

  const toggleCapability = (capability: MemberCapability, checked: boolean) => {
    setCapabilities((current) =>
      checked ? [...current, capability] : current.filter((row) => row !== capability),
    );
  };

  const submit = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const invite = await issueMemberInvite(orgId, [...capabilities]);
      setIssued(invite);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invite failed');
    } finally {
      setBusy(false);
    }
  };

  if (issued) {
    const link = inviteAcceptUrl(issued.code);
    return (
      <>
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            Send this link to your colleague. They open it, pick a login and password, and join the
            organization.
          </p>
          <p className="text-muted-foreground text-xs">
            {ROLE_LABELS[role]} access · works once · expires in 24 hours
          </p>
          <div className="min-w-0 rounded-lg border bg-muted/30 p-3">
            <code
              className="block select-all break-all font-mono text-xs leading-relaxed"
              data-testid="invite-link"
            >
              {link}
            </code>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onResolve?.(issued)}
            data-testid="invite-done"
          >
            Done
          </Button>
          <Button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(link).then(
                () => {
                  toast.add({ title: 'Invite link copied' });
                },
                () => {
                  toast.add({ title: 'Could not copy invite link' });
                },
              );
            }}
            data-testid="invite-link-copy"
          >
            <CopyIcon />
            Copy link
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-medium text-sm">Role</p>
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {capabilities.length} selected
          </span>
        </div>
        <p className="text-muted-foreground text-xs leading-4">
          Pick a preset or hand-pick capabilities. Custom clears the set; the role always follows
          the selected capabilities.
        </p>
        <RolePicker value={role} onChange={choosePreset} testIdPrefix="invite" />
      </div>

      <div className="flex flex-col gap-2">
        <p className="font-medium text-sm">Capabilities</p>
        <CapabilityChecklist
          capabilities={capabilities}
          onToggle={toggleCapability}
          testIdPrefix="invite"
        />
      </div>

      {capabilities.length === 0 ? (
        <p className="text-destructive text-xs">Select at least one capability.</p>
      ) : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={capabilities.length === 0 || busy}
          onClick={() => void submit()}
          data-testid="invite-submit"
        >
          {busy ? 'Issuing…' : 'Create invite'}
        </Button>
      </DialogFooter>
    </>
  );
}
