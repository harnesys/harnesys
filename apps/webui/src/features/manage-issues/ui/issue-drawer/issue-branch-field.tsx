import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

const ACTIVE_CHECKOUT = '__active_checkout__';

export interface IssueBranchCreateInput {
  branch: string;
  createWorktree: boolean;
}

export function IssueBranchField({
  branches,
  activeBranch,
  attachedBranch,
  branch,
  disabled,
  hasError,
  busy,
  branchNameSeed,
  onChange,
  onCreateBranch,
}: {
  branches: string[];
  activeBranch: string | null;
  attachedBranch: string | null;
  branch: string | null;
  disabled: boolean;
  hasError: boolean;
  busy: boolean;
  branchNameSeed: string;
  onChange: (branch: string | null) => void;
  onCreateBranch?: (input: IssueBranchCreateInput) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [withWorktree, setWithWorktree] = useState(false);
  const activeCheckoutLabel = activeBranch
    ? `Active checkout (${activeBranch})`
    : 'Active checkout';

  const openForm = (): void => {
    setName(branchNameSeed);
    setWithWorktree(false);
    setFormOpen(true);
  };

  const submit = (): void => {
    const trimmed = name.trim();
    if (!trimmed || !onCreateBranch) {
      return;
    }
    onCreateBranch({ branch: trimmed, createWorktree: withWorktree });
    setFormOpen(false);
    setName('');
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="font-medium text-muted-foreground text-xs">Branch</Label>
        {onCreateBranch ? (
          <button
            type="button"
            className="text-muted-foreground text-xs underline-offset-2 hover:underline disabled:opacity-50"
            disabled={disabled}
            onClick={openForm}
            data-testid="issue-branch-new"
          >
            New branch…
          </button>
        ) : null}
      </div>
      <Select
        items={[
          { value: ACTIVE_CHECKOUT, label: activeCheckoutLabel },
          ...branches.map((item) => ({ value: item, label: item })),
        ]}
        value={branch ?? attachedBranch ?? activeBranch ?? ACTIVE_CHECKOUT}
        disabled={disabled}
        onValueChange={(next) => onChange(!next || next === ACTIVE_CHECKOUT ? null : String(next))}
      >
        <SelectTrigger className="w-full" data-testid="issue-branch-select">
          <SelectValue placeholder="Branch" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ACTIVE_CHECKOUT}>{activeCheckoutLabel}</SelectItem>
          {branches.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hasError ? (
        <p className="text-[11px] text-muted-foreground">
          Branch list unavailable — the source may need to be prepared first.
        </p>
      ) : null}
      {formOpen && onCreateBranch ? (
        <BranchCreateForm
          busy={busy}
          branchName={name}
          withWorktree={withWorktree}
          onBranchNameChange={setName}
          onWithWorktreeChange={setWithWorktree}
          onCancel={() => setFormOpen(false)}
          onSubmit={submit}
        />
      ) : null}
    </div>
  );
}

function BranchCreateForm({
  busy,
  branchName,
  withWorktree,
  onBranchNameChange,
  onWithWorktreeChange,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  branchName: string;
  withWorktree: boolean;
  onBranchNameChange: (value: string) => void;
  onWithWorktreeChange: (value: boolean) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-2 rounded-md border p-3" data-testid="issue-branch-create">
      <Input
        className="h-8 font-mono text-xs"
        placeholder="issue/…"
        value={branchName}
        disabled={busy}
        autoFocus
        onChange={(event) => onBranchNameChange(event.target.value)}
        data-testid="issue-branch-create-name"
      />
      <div className="flex items-center gap-2">
        <Checkbox
          id="issue-branch-create-worktree"
          checked={withWorktree}
          onCheckedChange={(checked) => onWithWorktreeChange(checked === true)}
        />
        <Label htmlFor="issue-branch-create-worktree" className="font-normal">
          Create Worktree
        </Label>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || branchName.trim().length === 0}
          onClick={onSubmit}
          data-testid="issue-branch-create-submit"
        >
          Create Issue Branch
        </Button>
      </div>
    </div>
  );
}
