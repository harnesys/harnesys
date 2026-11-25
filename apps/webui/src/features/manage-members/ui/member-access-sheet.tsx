import { useState } from 'react';
import { type MemberCapability, type MemberView } from '@/shared/api/members';
import { Button } from '@/shared/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet';
import { UserAvatar } from '@/shared/ui/user-avatar';
import {
  type MemberRole,
  membershipRole,
  ROLE_LABELS,
  roleCapabilities,
} from '../model/member-access';
import { CapabilityChecklist, RolePicker } from './capability-form';
import { RoleBadge } from './role-badge';

interface MemberAccessSheetProps {
  open: boolean;
  member: MemberView | null;
  busy: boolean;
  onClose: () => void;
  onSave: (capabilities: MemberCapability[]) => void;
}

export function MemberAccessSheet({ open, member, busy, onClose, onSave }: MemberAccessSheetProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <SheetContent
        side="right"
        className="flex flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        data-testid="member-access-sheet"
      >
        {member ? (
          <MemberAccessEditor
            key={`${member.userId}:${open ? 'open' : 'closed'}:${member.updatedAt}`}
            member={member}
            busy={busy}
            onSave={onSave}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function MemberAccessEditor({
  member,
  busy,
  onSave,
}: {
  member: MemberView;
  busy: boolean;
  onSave: (capabilities: MemberCapability[]) => void;
}) {
  const role = membershipRole(member.capabilities);
  const owner = role === 'owner';
  const [draft, setDraft] = useState<MemberCapability[]>([
    ...member.capabilities,
  ] as MemberCapability[]);
  const draftRole = membershipRole(draft);
  const displayName = member.name.trim() || member.login;

  const choosePreset = (next: MemberRole) => {
    setDraft([...roleCapabilities(next)]);
  };

  const toggleCapability = (capability: MemberCapability, checked: boolean) => {
    setDraft((current) =>
      checked ? [...current, capability] : current.filter((row) => row !== capability),
    );
  };

  const reset = () => {
    setDraft([...member.capabilities] as MemberCapability[]);
  };

  const dirty =
    draft.length !== member.capabilities.length ||
    draft.some((capability) => !member.capabilities.includes(capability));

  return (
    <>
      <SheetHeader className="border-b px-5 py-4 pr-12">
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar name={displayName} seed={member.userId} color={member.color} size="lg" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <SheetTitle className="truncate">{displayName}</SheetTitle>
            <SheetDescription className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="truncate font-mono text-[11px]">{member.login}</span>
              <span aria-hidden="true">·</span>
              <RoleBadge role={draftRole} />
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-4">
        {owner && dirty ? (
          <p className="rounded-md border border-status-warn/40 bg-status-warn/10 px-2.5 py-2 text-status-warn text-xs leading-4">
            This member has full owner access. Saving a narrower set removes the owner role.
          </p>
        ) : null}

        <section className="flex flex-col gap-2">
          <div>
            <p className="font-medium text-sm">Role</p>
            <p className="text-muted-foreground text-xs leading-4">
              Pick a preset or hand-pick capabilities below. Custom clears the set to start from
              scratch.
            </p>
          </div>
          <RolePicker value={draftRole} onChange={choosePreset} testIdPrefix="member-access" />
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-medium text-sm">Capabilities</p>
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {draft.length} selected
            </span>
          </div>
          <CapabilityChecklist
            capabilities={draft}
            onToggle={toggleCapability}
            testIdPrefix="member-access"
          />
        </section>
      </div>

      <SheetFooter className="flex-row items-center justify-between gap-2 border-t px-5 py-3">
        {draft.length === 0 ? (
          <span className="text-destructive text-xs">Select at least one capability.</span>
        ) : (
          <span className="truncate text-muted-foreground text-xs">
            {ROLE_LABELS[draftRole]} access
          </span>
        )}
        <div className="flex shrink-0 items-center gap-1.5">
          <Button type="button" variant="ghost" disabled={!dirty || busy} onClick={reset}>
            Discard
          </Button>
          <Button
            type="button"
            disabled={!dirty || busy || draft.length === 0}
            onClick={() => onSave([...draft])}
            data-testid={`member-save-${member.login}`}
          >
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </SheetFooter>
    </>
  );
}
