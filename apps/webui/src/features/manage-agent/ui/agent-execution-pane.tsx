import type { WorkspaceRef } from '@harnesys/contracts';
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
const SANDBOX_VALUE = '__sandbox__';
const SOURCE_PREFIX = 'source:';
const FOLDER_PREFIX = 'folder:';

interface AgentExecutionPaneProps {
  form: AgentFieldsForm;
  activeAgent: Agent | null;
}

interface SourceRootOption {
  sourceId: string;
  root: string;
  label: string;
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
  const sourceOptions: SourceRootOption[] = sources.map((source, index) => ({
    sourceId: source.id,
    root: locations[index]?.data?.absoluteRoot ?? '',
    label: source.name,
  }));

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
      <DefaultWorkspaceField form={form} orgId={orgId} sourceOptions={sourceOptions} />
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

function DefaultWorkspaceField({
  form,
  orgId,
  sourceOptions,
}: {
  form: AgentFieldsForm;
  orgId: string;
  sourceOptions: SourceRootOption[];
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customPath, setCustomPath] = useState('');
  const [subpathDraft, setSubpathDraft] = useState<string | null>(null);
  const workspaceRef = useWatch({ control: form.control, name: 'defaultWorkspaceRef' }) ?? null;
  const legacyRunDirectory =
    useWatch({ control: form.control, name: 'defaultRunDirectory' }) ?? null;
  const workspaceValue = workspaceValueOf(workspaceRef);
  const subpathValue = subpathDraft ?? subpathOf(workspaceRef);
  const workspaceDetail = workspaceDetailOf(workspaceRef, sourceOptions);
  const legacyLabel = legacyRunDirectory
    ? (sourceOptions.find((option) => option.root === legacyRunDirectory)?.label ??
      legacyRunDirectory)
    : null;
  const items = workspaceItems(workspaceRef, sourceOptions);
  const subpathInvalid = subpathValue.trim().startsWith('/');
  const saveWorkspace = (ref: WorkspaceRef) => {
    setSubpathDraft(null);
    form.setValue('defaultWorkspaceRef', ref, { shouldDirty: true });
  };
  const selectWorkspace = (value: string | null) => {
    if (value === null) {
      return;
    }
    if (value === CUSTOM_DIRECTORY_VALUE) {
      setCustomPath('');
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    form.setValue('defaultRunDirectory', null, { shouldDirty: true });
    if (value === SANDBOX_VALUE) {
      saveWorkspace({ kind: 'sandbox' });
      return;
    }
    if (value.startsWith(SOURCE_PREFIX)) {
      saveWorkspace({ kind: 'source', sourceId: value.slice(SOURCE_PREFIX.length) });
      return;
    }
    if (value.startsWith(FOLDER_PREFIX)) {
      saveWorkspace({ kind: 'folder', path: value.slice(FOLDER_PREFIX.length) });
    }
  };
  const applySubpath = () => {
    if (!workspaceRef || !isSubpathRef(workspaceRef)) {
      return;
    }
    const trimmed = subpathValue.trim();
    if (trimmed.startsWith('/')) {
      return;
    }
    saveWorkspace(
      trimmed === '' ? withoutSubpath(workspaceRef) : { ...workspaceRef, subpath: trimmed },
    );
  };
  return (
    <>
      <Field>
        <FieldLabel>Default workspace</FieldLabel>
        <Select items={items} value={workspaceValue} onValueChange={selectWorkspace}>
          <SelectTrigger data-testid="agent-default-workspace">
            <SelectValue placeholder="Thread directory (default)" />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {workspaceRef && isSubpathRef(workspaceRef) ? (
          <div className="flex items-center gap-1.5">
            <Input
              className="h-7 font-mono text-xs"
              placeholder="subfolder (optional)"
              aria-label="Default workspace subfolder"
              aria-invalid={subpathInvalid || undefined}
              value={subpathValue}
              onChange={(event) => setSubpathDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applySubpath();
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={subpathInvalid}
              onClick={applySubpath}
            >
              Apply
            </Button>
          </div>
        ) : null}
        {subpathInvalid ? <FieldError>Subfolder must not start with a slash</FieldError> : null}
        <WorkspaceHint detail={workspaceDetail} legacyLabel={legacyLabel} />
      </Field>
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
                  data-testid="agent-default-workspace-select"
                  onClick={() => {
                    const trimmed = customPath.trim();
                    if (!trimmed.startsWith('/')) {
                      return;
                    }
                    form.setValue('defaultRunDirectory', null, { shouldDirty: true });
                    saveWorkspace({ kind: 'folder', path: trimmed });
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
    </>
  );
}

function subpathOf(ref: WorkspaceRef | null): string {
  return ref && isSubpathRef(ref) ? (ref.subpath ?? '') : '';
}

function isSubpathRef(
  ref: WorkspaceRef,
): ref is Extract<WorkspaceRef, { kind: 'source' | 'worktree' }> {
  return ref.kind === 'source' || ref.kind === 'worktree';
}

function WorkspaceHint({
  detail,
  legacyLabel,
}: {
  detail: string | null;
  legacyLabel: string | null;
}) {
  if (detail) {
    return <p className="font-mono text-[11px] text-muted-foreground leading-snug">{detail}</p>;
  }
  if (legacyLabel) {
    return (
      <p className="text-muted-foreground text-xs leading-snug">
        Legacy default run directory: <span className="font-mono">{legacyLabel}</span> (read-only)
      </p>
    );
  }
  return (
    <p className="text-muted-foreground text-xs leading-snug">
      New threads for this agent start in their private thread directory.
    </p>
  );
}

function workspaceValueOf(ref: WorkspaceRef | null): string {
  if (!ref || ref.kind === 'inherit' || ref.kind === 'sandbox') {
    return SANDBOX_VALUE;
  }
  if (ref.kind === 'folder') {
    return `${FOLDER_PREFIX}${ref.path}`;
  }
  return `${SOURCE_PREFIX}${ref.sourceId}`;
}

function workspaceItems(ref: WorkspaceRef | null, roots: SourceRootOption[]) {
  const items = [
    { value: SANDBOX_VALUE, label: 'Thread directory' },
    ...roots.map((option) => ({
      value: `${SOURCE_PREFIX}${option.sourceId}`,
      label: option.label,
    })),
  ];
  if (
    ref?.kind === 'folder' &&
    !items.some((item) => item.value === `${FOLDER_PREFIX}${ref.path}`)
  ) {
    items.push({ value: `${FOLDER_PREFIX}${ref.path}`, label: ref.path });
  }
  if (
    (ref?.kind === 'source' || ref?.kind === 'worktree') &&
    !items.some((item) => item.value === `${SOURCE_PREFIX}${ref.sourceId}`)
  ) {
    items.push({
      value: `${SOURCE_PREFIX}${ref.sourceId}`,
      label: ref.sourceId.slice(0, 8),
    });
  }
  items.push({ value: CUSTOM_DIRECTORY_VALUE, label: 'Custom path...' });
  return items;
}

function workspaceDetailOf(ref: WorkspaceRef | null, roots: SourceRootOption[]): string | null {
  if (!ref || ref.kind === 'inherit' || ref.kind === 'sandbox') {
    return null;
  }
  if (ref.kind === 'folder') {
    return ref.path;
  }
  const label = roots.find((option) => option.sourceId === ref.sourceId)?.label ?? ref.sourceId;
  return ref.subpath !== undefined ? `${label}/${ref.subpath}` : label;
}

function withoutSubpath(ref: Extract<WorkspaceRef, { kind: 'source' | 'worktree' }>): WorkspaceRef {
  if (ref.kind === 'worktree') {
    return { kind: 'worktree', sourceId: ref.sourceId, worktreeId: ref.worktreeId };
  }
  return { kind: 'source', sourceId: ref.sourceId };
}
