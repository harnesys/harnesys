import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { appMetaQuery, fleetNodesQuery } from '@/shared/api';
import { getActiveOrgId } from '@/shared/api/active-org';
import { projectQueryKey } from '@/shared/api/projects';
import { attachGit } from '@/shared/api/sources';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { toast } from '@/shared/ui/toast';
import {
  type AttachGitFieldsInput,
  type AttachGitFieldsOutput,
  attachGitFieldsSchema,
  emptyAttachGitFields,
} from '../model/attach-git-fields';

export function AttachGitDialog({ onResolve }: DialogComponentProps<boolean>) {
  const queryClient = useQueryClient();
  const { data: nodes } = useQuery(fleetNodesQuery);
  const { data: meta } = useQuery(appMetaQuery());
  const nodeItems = (nodes ?? []).map((node) => ({ value: node.id, label: node.name }));
  const showNodes = nodeItems.length > 1;
  const defaultHostId = meta?.nodeId ?? nodeItems[0]?.value;
  const form = useForm<AttachGitFieldsInput, unknown, AttachGitFieldsOutput>({
    resolver: zodResolver(attachGitFieldsSchema),
    defaultValues: emptyAttachGitFields(defaultHostId),
  });
  const mutation = useMutation({
    mutationFn: (values: AttachGitFieldsOutput) => {
      const orgId = getActiveOrgId();
      if (!orgId) {
        return Promise.reject(new Error('No active org'));
      }
      return attachGit(orgId, {
        url: values.url,
        ...(values.name ? { name: values.name } : {}),
        ...(values.branch ? { branch: values.branch } : {}),
        ...(values.hostId ? { hostId: values.hostId } : {}),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectQueryKey });
      toast.add({ title: 'Git source attached' });
      onResolve?.(true);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Attach failed';
      toast.add({ title: 'Attach failed', description: msg });
    },
  });
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit((values) => {
        mutation.mutate(values);
      })}
    >
      <FieldGroup>
        {showNodes ? (
          <Controller
            control={form.control}
            name="hostId"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="attach-git-host">Host</FieldLabel>
                <Select
                  items={nodeItems}
                  value={field.value ?? defaultHostId}
                  onValueChange={(next) => {
                    if (typeof next === 'string') {
                      field.onChange(next);
                    }
                  }}
                >
                  <SelectTrigger id="attach-git-host" size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="w-full" align="start">
                    {nodeItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Host that materializes the bare clone and worktree.
                </FieldDescription>
              </Field>
            )}
          />
        ) : null}
        <Controller
          control={form.control}
          name="url"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor="attach-git-url">Repository URL</FieldLabel>
              <Input
                {...field}
                id="attach-git-url"
                placeholder="https://github.com/org/repo.git"
                autoFocus
                aria-invalid={fieldState.invalid || undefined}
              />
              <FieldDescription>Public HTTPS URL (no token in config).</FieldDescription>
              {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="name"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="attach-git-name">Name</FieldLabel>
              <Input {...field} id="attach-git-name" placeholder="Optional display name" />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="branch"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="attach-git-branch">Branch</FieldLabel>
              <Input {...field} id="attach-git-branch" placeholder="Default branch if empty" />
              <FieldDescription>Leave empty to use the remote default branch.</FieldDescription>
            </Field>
          )}
        />
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Cloning…' : 'Add repository'}
        </Button>
      </DialogFooter>
    </form>
  );
}
