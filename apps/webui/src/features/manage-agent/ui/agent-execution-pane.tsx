import { useQueries, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, type UseFormReturn, useWatch } from 'react-hook-form';
import type { Agent } from '@/entities/agent';
import { executionProfilesQuery, LOCAL_EXECUTION_PROFILE_ID } from '@/shared/api';
import { getActiveOrgId } from '@/shared/api/active-org';
import { getSourceLocation, sourceLocationQueryKey } from '@/shared/api/source-location';
import { listSources } from '@/shared/api/sources';
import { Button } from '@/shared/ui/button';
import { Field, FieldError, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { FolderBrowser } from '@/widgets/folder-browser';
import type { AgentFieldsInput, AgentFieldsOutput } from '../model/agent-fields';

type AgentFieldsForm = UseFormReturn<AgentFieldsInput, unknown, AgentFieldsOutput>;

const CUSTOM_DIRECTORY_VALUE = '__custom__';

interface AgentExecutionPaneProps {
  form: AgentFieldsForm;
  activeAgent: Agent | null;
}

export function AgentExecutionPane({ form, activeAgent }: AgentExecutionPaneProps) {
  const orgId = getActiveOrgId() ?? activeAgent?.orgId ?? '';
  const { data: profiles } = useQuery(executionProfilesQuery(orgId));
  const overrideProfileId = useWatch({ control: form.control, name: 'executionProfileId' });
  const defaultProfileId = profiles?.defaultProfileId ?? null;
  const ownProfileId = overrideProfileId ?? null;
  const effectiveProfileId = ownProfileId ?? defaultProfileId;
  const effectiveProfile = profiles?.items.find((item) => item.id === effectiveProfileId);
  const selectedBy = ownProfileId ? 'agent' : 'organization';
  const [customOpen, setCustomOpen] = useState(false);
  const [customPath, setCustomPath] = useState('');
  const runDirectory = useWatch({ control: form.control, name: 'defaultRunDirectory' });
  const sourcesQuery = useQuery({
    queryKey: ['sources', orgId] as const,
    queryFn: () => listSources(orgId),
    enabled: Boolean(orgId),
  });
  const sources = sourcesQuery.data?.sources ?? [];
  const locations = useQueries({
    queries: sources.map((source) => ({
      queryKey: sourceLocationQueryKey(source.id),
      queryFn: () => getSourceLocation(source.id),
      enabled: sources.length > 0,
      staleTime: 600000,
    })),
  });
  const rootOptions = sources
    .map((source, index) => ({
      value: locations[index]?.data?.absoluteRoot ?? null,
      label: source.name,
    }))
    .filter((option): option is { value: string; label: string } => option.value !== null);
  const runDirectoryLabel = runDirectory
    ? (rootOptions.find((option) => option.value === runDirectory)?.label ?? runDirectory)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm">
        <p className="text-muted-foreground">Effective execution profile</p>
        <p className="font-medium">{effectiveProfile?.name ?? '—'}</p>
        <p className="text-muted-foreground text-xs">
          {selectedBy === 'agent'
            ? 'Selected by this agent'
            : `Inherited from organization${defaultProfileId ? '' : ' (none set)'}`}
        </p>
        {effectiveProfile ? (
          <p className="text-muted-foreground text-xs">
            {effectiveProfile.isolation === 'container' ? 'Container' : 'Host'} isolation ·{' '}
            {effectiveProfile.nodeIds.length}{' '}
            {effectiveProfile.nodeIds.length === 1 ? 'host' : 'hosts'} in profile
          </p>
        ) : null}
      </div>
      <Controller
        control={form.control}
        name="executionProfileId"
        render={({ field }) => (
          <Field>
            <FieldLabel>Agent profile override</FieldLabel>
            <Select
              value={field.value ?? ''}
              onValueChange={(value) => field.onChange(value || null)}
            >
              <SelectTrigger data-testid="agent-execution-profile">
                <SelectValue placeholder="Inherit from organization" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Inherit from organization</SelectItem>
                {profiles?.items.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.name}
                    {profile.isDefault ? ' (default)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      />
      {effectiveProfileId === LOCAL_EXECUTION_PROFILE_ID && (
        <p className="text-muted-foreground text-xs">
          Local profile runs only on the relay. A file rule pinned to another node needs a profile
          that includes it.
        </p>
      )}
      <Controller
        control={form.control}
        name="defaultRunDirectory"
        render={({ field }) => (
          <Field>
            <FieldLabel>Default run directory</FieldLabel>
            <Select
              value={field.value ?? ''}
              onValueChange={(value) => {
                if (value === CUSTOM_DIRECTORY_VALUE) {
                  setCustomPath('');
                  setCustomOpen(true);
                  return;
                }
                setCustomOpen(false);
                field.onChange(value || null);
              }}
            >
              <SelectTrigger data-testid="agent-default-run-directory">
                <SelectValue placeholder="Thread sandbox (default)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Thread sandbox (default)</SelectItem>
                {rootOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
                {field.value && !rootOptions.some((option) => option.value === field.value) ? (
                  <SelectItem value={field.value}>{field.value}</SelectItem>
                ) : null}
                <SelectItem value={CUSTOM_DIRECTORY_VALUE}>Custom path...</SelectItem>
              </SelectContent>
            </Select>
            {runDirectoryLabel ? (
              <p className="font-mono text-[11px] text-muted-foreground leading-snug">
                {runDirectoryLabel}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs leading-snug">
                New threads for this agent start in their private sandbox.
              </p>
            )}
          </Field>
        )}
      />
      {customOpen ? (
        <Popover open onOpenChange={(open) => (open ? undefined : setCustomOpen(false))}>
          <PopoverTrigger className="hidden" aria-hidden />
          <PopoverContent align="start" className="w-96 p-2">
            <div className="flex flex-col gap-2">
              <FolderBrowser orgId={orgId || undefined} autoFocus onChange={setCustomPath} />
              <div className="flex items-center justify-end gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setCustomOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!customPath.trim().startsWith('/')}
                  data-testid="agent-default-run-directory-select"
                  onClick={() => {
                    const trimmed = customPath.trim();
                    if (!trimmed.startsWith('/')) {
                      return;
                    }
                    form.setValue('defaultRunDirectory', trimmed, { shouldDirty: true });
                    setCustomOpen(false);
                  }}
                >
                  Select
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
      <Controller
        control={form.control}
        name="streamIdleTimeoutMs"
        render={({ field, fieldState }) => (
          <Field className="gap-1.5" data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor="agent-streamIdleTimeoutMs">Stream idle timeout, ms</FieldLabel>
            <Input
              id="agent-streamIdleTimeoutMs"
              inputMode="numeric"
              placeholder="300000"
              aria-invalid={fieldState.invalid || undefined}
              value={typeof field.value === 'string' ? field.value : ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur();
                }
              }}
              name={field.name}
              ref={field.ref}
            />
            <p className="text-[11px] text-muted-foreground leading-snug">
              Abort the provider stream when no data arrives for this long. Blank = 300000 ms (5
              min).
            </p>
            {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
          </Field>
        )}
      />
    </div>
  );
}
