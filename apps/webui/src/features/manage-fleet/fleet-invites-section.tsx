import type { ActiveInvite } from '@/shared/api/fleet';
import { Button } from '@/shared/ui/button';
import { RowChip } from '@/shared/ui/capability-rows';
import { Input } from '@/shared/ui/input';
import { SettingsEmpty, SettingsField, SettingsSection } from '@/shared/ui/settings-kit';

interface IssuedInviteCard {
  code: string;
  relayUrl: string;
  orgId: string;
}

interface FleetInvitesSectionProps {
  canIssue: boolean;
  nodeName: string;
  onNodeNameChange: (value: string) => void;
  busy: boolean;
  onIssue: () => void;
  issuedInvite: IssuedInviteCard | null;
  invites: ActiveInvite[];
  onRevoke: (inviteId: string) => void;
}

export function FleetInvitesSection({
  canIssue,
  nodeName,
  onNodeNameChange,
  busy,
  onIssue,
  issuedInvite,
  invites,
  onRevoke,
}: FleetInvitesSectionProps) {
  return (
    <SettingsSection
      label="Invites"
      count={invites.length}
      description="One-time codes for another machine to join this organization."
      testId="fleet-invites"
    >
      {canIssue ? (
        <SettingsField
          label="New invite"
          description="Name the worker before issuing; the code is shown once."
          htmlFor="invite-node-name"
        >
          <div className="flex items-center gap-2">
            <Input
              id="invite-node-name"
              value={nodeName}
              onChange={(event) => onNodeNameChange(event.target.value)}
              placeholder="MacBook"
              data-testid="fleet-invite-name"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onIssue();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void onIssue()}
              data-testid="fleet-invite-issue"
            >
              Issue invite
            </Button>
          </div>
        </SettingsField>
      ) : (
        <p className="px-1 text-muted-foreground text-xs">
          Invites are issued on the server desk. Active codes still show here.
        </p>
      )}

      {issuedInvite ? (
        <div
          className="flex flex-col gap-3 rounded-lg border border-status-ok/30 bg-status-ok/5 p-3"
          data-testid="fleet-invite-issued"
        >
          <div className="flex items-center gap-2">
            <RowChip tone="ok">ready</RowChip>
            <p className="text-sm">
              Open Join organization on the other machine and paste these values.
            </p>
          </div>
          <dl className="grid gap-1.5 rounded-md border bg-background p-3 font-mono text-xs">
            <InviteField label="Relay URL" value={issuedInvite.relayUrl} />
            <InviteField label="Org ID" value={issuedInvite.orgId} />
            <InviteField label="Invite code" value={issuedInvite.code} highlight />
          </dl>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => {
              void navigator.clipboard.writeText(
                `Relay URL: ${issuedInvite.relayUrl}\nOrg ID: ${issuedInvite.orgId}\nInvite code: ${issuedInvite.code}`,
              );
            }}
          >
            Copy join card
          </Button>
        </div>
      ) : null}

      {invites.length === 0 ? (
        <SettingsEmpty
          title="No active invites"
          description={
            canIssue
              ? 'Issue a code when you want another machine to join this organization.'
              : 'When the server issues a code, it will appear in this list.'
          }
          testId="fleet-invites-empty"
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border/60">
          {invites.map((invite) => (
            <li
              key={invite.inviteId}
              className="flex items-center justify-between gap-3 px-1 py-2.5"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-mono text-sm tracking-[0.18em]">{invite.code}</span>
                <span className="truncate text-muted-foreground text-xs">{invite.nodeName}</span>
              </div>
              {canIssue ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  disabled={busy}
                  onClick={() => onRevoke(invite.inviteId)}
                >
                  Revoke
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}

function InviteField({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 break-all ${highlight ? 'font-medium text-foreground' : ''}`}>
        {value}
      </dd>
    </div>
  );
}
