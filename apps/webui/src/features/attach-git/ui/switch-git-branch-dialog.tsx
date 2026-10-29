import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { getActiveOrgId } from '@/shared/api/active-org';
import { selfNodeCached } from '@/shared/api/fleet';
import { listGitBranches } from '@/shared/api/sources';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

const schema = z.object({
  branch: z.string().trim().min(1, 'Branch required'),
});

type FieldsInput = z.input<typeof schema>;
type FieldsOutput = z.output<typeof schema>;

export function SwitchGitBranchDialog({
  onResolve,
  data,
}: DialogComponentProps<
  string,
  {
    sourceId: string;
    currentBranch?: string;
  }
>) {
  const sourceId = data?.sourceId ?? '';
  const orgId = getActiveOrgId() ?? '';
  const hostId = selfNodeCached() ?? '';
  const branchesQuery = useQuery({
    queryKey: ['git-branches', orgId, sourceId, hostId],
    queryFn: () => listGitBranches(orgId, sourceId, hostId),
    enabled: Boolean(orgId && sourceId && hostId),
  });
  const branches = branchesQuery.data?.branches ?? [];
  const activeBranch = branchesQuery.data?.activeBranch ?? data?.currentBranch ?? '';
  const items = branches.map((branch) => ({ value: branch, label: branch }));
  const form = useForm<FieldsInput, unknown, FieldsOutput>({
    resolver: zodResolver(schema),
    values: { branch: activeBranch },
  });
  const busy = branchesQuery.isLoading;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit((values) => onResolve?.(values.branch))}
    >
      <FieldGroup>
        <Controller
          control={form.control}
          name="branch"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor="switch-git-branch">Branch</FieldLabel>
              <Select
                items={items}
                value={field.value}
                onValueChange={(next) => {
                  if (typeof next === 'string') {
                    field.onChange(next);
                  }
                }}
                disabled={busy || items.length === 0}
              >
                <SelectTrigger id="switch-git-branch" size="sm" className="w-full">
                  <SelectValue placeholder={busy ? 'Loading…' : 'Select branch'} />
                </SelectTrigger>
                <SelectContent className="w-full" align="start">
                  {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                Switches the active worktree. Other worktrees stay on disk.
              </FieldDescription>
              {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
              {branchesQuery.isError ? (
                <FieldError>
                  {branchesQuery.error instanceof Error
                    ? branchesQuery.error.message
                    : 'Failed to load branches'}
                </FieldError>
              ) : null}
            </Field>
          )}
        />
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || items.length === 0}>
          Switch
        </Button>
      </DialogFooter>
    </form>
  );
}
