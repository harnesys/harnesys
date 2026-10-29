import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { appMetaQuery, fleetNodesQuery } from '@/shared/api';
import { getActiveOrgId } from '@/shared/api/active-org';
import { projectQueryKey } from '@/shared/api/projects';
import { attachGit, attachLocalFolder } from '@/shared/api/sources';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { toast } from '@/shared/ui/toast';
import {
  type AddSourceFieldsInput,
  type AddSourceFieldsOutput,
  type AddSourceTab,
  addSourceFieldsSchema,
  emptyAddSourceFields,
} from '../model/add-source-fields';
import { DirectoryPicker } from './directory-picker';

const visibilityItems = [
  { value: 'org', label: 'Org' },
  { value: 'host', label: 'Host' },
];

export function AddSourceDialog({ onResolve }: DialogComponentProps<boolean>) {
  const queryClient = useQueryClient();
  const { data: nodes } = useQuery(fleetNodesQuery);
  const { data: meta } = useQuery(appMetaQuery);
  const nodeItems = (nodes ?? []).map((node) => ({ value: node.id, label: node.name }));
  const showNodes = nodeItems.length > 1;
  const defaultHostId = meta?.nodeId ?? nodeItems[0]?.value;
  const form = useForm<AddSourceFieldsInput, unknown, AddSourceFieldsOutput>({
    resolver: zodResolver(addSourceFieldsSchema),
    defaultValues: emptyAddSourceFields(defaultHostId),
  });
  const tab = form.watch('tab');
  const hostId = form.watch('hostId');
  const orgId = getActiveOrgId();
  const mutation = useMutation({
    mutationFn: (values: AddSourceFieldsOutput) => {
      if (!orgId) {
        return Promise.reject(new Error('No active org'));
      }
      if (values.tab === 'git') {
        return attachGit(orgId, {
          url: values.url,
          ...(values.name ? { name: values.name } : {}),
          ...(values.branch ? { branch: values.branch } : {}),
          ...(values.credRef ? { credRef: values.credRef } : {}),
          ...(values.hostId ? { hostId: values.hostId } : {}),
          uiVisibility: values.uiVisibility,
        });
      }
      return attachLocalFolder(orgId, {
        absolutePath: values.absolutePath,
        ...(values.name ? { name: values.name } : {}),
        ...(values.hostId ? { hostId: values.hostId } : {}),
        uiVisibility: values.uiVisibility,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectQueryKey });
      toast.add({ title: 'Source added' });
      onResolve?.(true);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Attach failed';
      toast.add({ title: 'Attach failed', description: msg });
    },
  });
  const isGit = tab === 'git';
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit((values) => {
        mutation.mutate(values);
      })}
    >
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (value === 'folder' || value === 'git') {
            form.setValue('tab', value satisfies AddSourceTab);
          }
        }}
      >
        <TabsList className="w-full">
          <TabsTrigger value="folder" className="flex-1">
            Folder
          </TabsTrigger>
          <TabsTrigger value="git" className="flex-1">
            Remote Git
          </TabsTrigger>
        </TabsList>
        <TabsContent value="folder">
          <FieldGroup>
            <Controller
              control={form.control}
              name="absolutePath"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid || undefined}>
                  <FieldLabel htmlFor="add-source-folder-path">Folder path</FieldLabel>
                  <DirectoryPicker
                    key={hostId || 'local'}
                    orgId={orgId ?? ''}
                    hostId={hostId || undefined}
                    value={field.value}
                    onChange={field.onChange}
                    invalid={fieldState.invalid || undefined}
                  />
                  <FieldDescription>
                    Browse the selected host and pick a folder, or type a path and press Apply.
                  </FieldDescription>
                  {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
                </Field>
              )}
            />
          </FieldGroup>
        </TabsContent>
        <TabsContent value="git">
          <FieldGroup>
            <Controller
              control={form.control}
              name="url"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid || undefined}>
                  <FieldLabel htmlFor="add-source-git-url">Repository URL</FieldLabel>
                  <Input
                    {...field}
                    id="add-source-git-url"
                    placeholder="https://github.com/org/repo.git"
                    autoFocus={isGit}
                    aria-invalid={fieldState.invalid || undefined}
                  />
                  <FieldDescription>Public HTTPS URL (no token in config).</FieldDescription>
                  {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="branch"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="add-source-git-branch">Branch</FieldLabel>
                  <Input
                    {...field}
                    id="add-source-git-branch"
                    placeholder="Default branch if empty"
                  />
                  <FieldDescription>Leave empty to use the remote default branch.</FieldDescription>
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="credRef"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="add-source-git-cred">Credential reference</FieldLabel>
                  <Input
                    {...field}
                    id="add-source-git-cred"
                    placeholder="Optional credential reference"
                  />
                  <FieldDescription>
                    Reference to a stored credential for private repositories.
                  </FieldDescription>
                </Field>
              )}
            />
          </FieldGroup>
        </TabsContent>
      </Tabs>
      <FieldGroup>
        <Controller
          control={form.control}
          name="name"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="add-source-name">Name</FieldLabel>
              <Input {...field} id="add-source-name" placeholder="Optional display name" />
              <FieldDescription>Defaults to the folder or repository name.</FieldDescription>
            </Field>
          )}
        />
        {showNodes ? (
          <Controller
            control={form.control}
            name="hostId"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="add-source-host">Host</FieldLabel>
                <Select
                  items={nodeItems}
                  value={field.value ?? defaultHostId}
                  onValueChange={(next) => {
                    if (typeof next === 'string') {
                      field.onChange(next);
                    }
                  }}
                >
                  <SelectTrigger id="add-source-host" size="sm" className="w-full">
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
                  Host that owns the folder or materializes the clone.
                </FieldDescription>
              </Field>
            )}
          />
        ) : null}
        <Controller
          control={form.control}
          name="uiVisibility"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="add-source-visibility">Visibility</FieldLabel>
              <Select
                items={visibilityItems}
                value={field.value}
                onValueChange={(next) => {
                  if (next === 'org' || next === 'host') {
                    field.onChange(next);
                  }
                }}
              >
                <SelectTrigger id="add-source-visibility" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="w-full" align="start">
                  {visibilityItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                Org shows the source to everyone; Host keeps it visible on the selected host only.
              </FieldDescription>
            </Field>
          )}
        />
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Adding…' : 'Add source'}
        </Button>
      </DialogFooter>
    </form>
  );
}
