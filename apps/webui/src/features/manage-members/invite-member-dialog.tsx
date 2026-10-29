import { useState } from 'react';
import {
  INVITE_PRESETS,
  type IssuedMemberInvite,
  issueMemberInvite,
  MEMBER_CAPABILITIES,
  type MemberCapability,
} from '@/shared/api/members';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { dialog } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { DialogFooter } from '@/shared/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { toast } from '@/shared/ui/toast';

export const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  operator: 'Operator',
  viewer: 'Viewer',
  custom: 'Custom',
} as const;

export type InvitePreset = Exclude<keyof typeof ROLE_LABELS, 'owner'>;

function matchesPreset(capabilities: string[], preset: readonly MemberCapability[]): boolean {
  return (
    preset.length === capabilities.length &&
    preset.every((capability) => capabilities.includes(capability))
  );
}

export function membershipRole(capabilities: string[]): keyof typeof ROLE_LABELS {
  if (matchesPreset(capabilities, MEMBER_CAPABILITIES)) {
    return 'owner';
  }
  for (const role of ['admin', 'operator', 'viewer'] as const) {
    if (matchesPreset(capabilities, INVITE_PRESETS[role])) {
      return role;
    }
  }
  return 'custom';
}

interface CapabilityGroup {
  label: string;
  capabilities: readonly MemberCapability[];
}

const CAPABILITY_GROUPS: readonly CapabilityGroup[] = [
  { label: 'Organization', capabilities: ['org.read', 'org.update', 'org.delete'] },
  { label: 'Members', capabilities: ['member.read', 'member.invite', 'member.manage'] },
  { label: 'Fleet', capabilities: ['fleet.read', 'fleet.invite', 'fleet.manage', 'host.promote'] },
  { label: 'Desk & runs', capabilities: ['desk.read', 'desk.write', 'run.start', 'run.cancel'] },
  { label: 'Sources', capabilities: ['source.read', 'source.write'] },
  { label: 'Secrets', capabilities: ['secret.read', 'secret.write'] },
  { label: 'Automation', capabilities: ['terminal.open', 'agent.manage', 'schedule.manage'] },
];

export function CapabilityForm({
  preset,
  capabilities,
  onPreset,
  onToggle,
}: {
  preset: InvitePreset;
  capabilities: readonly MemberCapability[];
  onPreset: (preset: InvitePreset) => void;
  onToggle: (capability: MemberCapability, checked: boolean) => void;
}) {
  return (
    <>
      <Select
        value={preset}
        onValueChange={(value) => {
          onPreset(value as InvitePreset);
        }}
      >
        <SelectTrigger className="w-full" data-testid="invite-preset-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(['admin', 'operator', 'viewer', 'custom'] as const).map((role) => (
            <SelectItem key={role} value={role} data-testid={`invite-preset-${role}`}>
              {ROLE_LABELS[role]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2" data-testid="member-capability-grid">
        {CAPABILITY_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-2">
            <p className="font-medium text-muted-foreground text-xs">{group.label}</p>
            {group.capabilities.map((capability) => (
              <div
                key={capability}
                className="flex items-center gap-2 text-xs"
                data-testid={`invite-capability-${capability}`}
              >
                <Checkbox
                  id={`invite-capability-${capability}`}
                  checked={capabilities.includes(capability)}
                  onCheckedChange={(checked) => onToggle(capability, checked === true)}
                />
                <label
                  htmlFor={`invite-capability-${capability}`}
                  className="cursor-pointer font-mono"
                >
                  {capability}
                </label>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

export function openInviteMemberDialog(orgId: string): Promise<IssuedMemberInvite | null> {
  return dialog.open(InviteMemberDialog, {
    title: 'Invite member',
    description: 'The invite code is shown once and expires in 24 hours.',
    data: { orgId },
    className: 'sm:max-w-lg',
  });
}

function InviteMemberDialog({
  onResolve,
  data,
}: DialogComponentProps<IssuedMemberInvite, { orgId: string }>) {
  const orgId = data?.orgId ?? '';
  const [preset, setPreset] = useState<InvitePreset>('operator');
  const [capabilities, setCapabilities] = useState<readonly MemberCapability[]>([
    ...INVITE_PRESETS.operator,
  ]);
  const [issued, setIssued] = useState<IssuedMemberInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choosePreset = (next: InvitePreset) => {
    setPreset(next);
    setCapabilities(next === 'custom' ? [] : [...INVITE_PRESETS[next]]);
  };

  const toggle = (capability: MemberCapability, checked: boolean) => {
    if (preset !== 'custom') {
      setPreset('custom');
    }
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
    return (
      <>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Give the code to the person and ask them to sign up with it. It is shown only once and
          expires in 24 hours.
        </p>
        <code
          className="select-all rounded-md bg-muted px-3 py-2 font-mono text-sm"
          data-testid="invite-code"
        >
          {issued.code}
        </code>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(issued.code);
              toast.add({ title: 'Invite code copied' });
            }}
            data-testid="invite-code-copy"
          >
            Copy code
          </Button>
          <Button type="button" onClick={() => onResolve?.(issued)} data-testid="invite-done">
            Done
          </Button>
        </DialogFooter>
      </>
    );
  }
  return (
    <>
      <p className="text-muted-foreground text-sm leading-relaxed">
        Pick a starting role. Custom lets you select every capability by hand.
      </p>
      <CapabilityForm
        preset={preset}
        capabilities={capabilities}
        onPreset={choosePreset}
        onToggle={toggle}
      />
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
