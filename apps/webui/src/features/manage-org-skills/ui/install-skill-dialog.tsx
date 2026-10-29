import type {
  DiscoverSkillsResponse,
  InstallSkillsBody,
  SkillCandidate,
  SkillSearchHit,
} from '@harnesys/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  discoverSkills,
  installSkills,
  orgSkillsQueryKey,
  searchSkills,
} from '@/shared/api/org-skills';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { dialog } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';
import {
  emptyInstallSkillStep,
  type InstallSkillStepValues,
  installSkillStepSchema,
  toDiscoverBody,
} from '../model/install-skill-form';

interface InstallSkillDialogData {
  orgId: string;
}

export function InstallSkillDialog({
  onResolve,
  data,
}: DialogComponentProps<boolean, InstallSkillDialogData>) {
  const orgId = data?.orgId ?? '';
  const queryClient = useQueryClient();
  const form = useForm<InstallSkillStepValues>({
    resolver: zodResolver(installSkillStepSchema),
    defaultValues: emptyInstallSkillStep(),
  });
  const [discovery, setDiscovery] = useState<DiscoverSkillsResponse | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ReadonlyArray<SkillSearchHit>>([]);
  const [degradedHint, setDegradedHint] = useState('');

  const discover = useMutation({
    mutationFn: (body: InstallSkillStepValues) => discoverSkills(orgId, toDiscoverBody(body)),
    onSuccess: (result) => {
      setDiscovery(result);
      setSelected(new Set());
    },
    onError: (error) => {
      toast.add({
        title: error instanceof Error ? error.message : 'Could not scan the repository',
      });
    },
  });

  const search = useMutation({
    mutationFn: (q: string) => searchSkills(q),
    onSuccess: (result) => {
      setHits(result.results);
      setDegradedHint(result.degraded ? (result.hint ?? 'Registry unavailable') : '');
    },
    onError: (error) => {
      toast.add({
        title: error instanceof Error ? error.message : 'Search failed',
      });
    },
  });

  const installFromHit = (hit: SkillSearchHit) => {
    form.setValue('url', hit.installUrl);
    toast.add({ title: `Scanning ${hit.source}…` });
    discover.mutate({ url: hit.installUrl, ref: '' });
  };

  const install = useMutation({
    mutationFn: (body: InstallSkillsBody) => installSkills(orgId, body),
    onSuccess: (result) => {
      if (result.conflicts.length > 0) {
        toast.add({
          title: 'Name conflicts with existing skills',
          description: result.conflicts.join(', '),
        });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: orgSkillsQueryKey(orgId) });
      toast.add({
        title:
          result.installed.length === 1
            ? 'Skill installed'
            : `Installed ${result.installed.length} skills`,
      });
      onResolve?.(true);
    },
    onError: (error) => {
      toast.add({
        title: error instanceof Error ? error.message : 'Install failed',
      });
    },
  });

  if (!discovery) {
    return (
      <form
        className="flex min-h-0 flex-col gap-4"
        onSubmit={form.handleSubmit((values) => {
          toast.add({ title: 'Scanning repository…' });
          discover.mutate(values);
        })}
      >
        <FieldGroup className="min-h-0 overflow-y-auto">
          <Field>
            <FieldLabel htmlFor="install-skill-search">Search registry</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="install-skill-search"
                placeholder="Skill name or keyword"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    search.mutate(query);
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={query.trim().length < 2 || search.isPending}
                onClick={() => search.mutate(query)}
              >
                {search.isPending ? 'Searching…' : 'Search'}
              </Button>
            </div>
          </Field>
          {degradedHint ? <p className="text-muted-foreground text-xs">{degradedHint}</p> : null}
          {hits.length > 0 ? (
            <SearchHits hits={hits} disabled={discover.isPending} onPick={installFromHit} />
          ) : null}
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-muted-foreground text-xs uppercase">or paste repository URL</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <Field>
            <FieldLabel htmlFor="install-skill-url">Repository URL</FieldLabel>
            <Input
              id="install-skill-url"
              placeholder="https://github.com/org/repo"
              {...form.register('url')}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="install-skill-ref">Branch or tag (optional)</FieldLabel>
            <Input id="install-skill-ref" placeholder="main" {...form.register('ref')} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onResolve?.()}>
            Cancel
          </Button>
          <Button type="submit" disabled={discover.isPending}>
            {discover.isPending ? 'Scanning…' : 'Scan repository'}
          </Button>
        </DialogFooter>
      </form>
    );
  }

  const container = discovery.candidates.filter((c) => !c.outsideContainer);
  const outside = discovery.candidates.filter((c) => c.outsideContainer);
  const toggle = (subPath: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(subPath);
      } else {
        next.delete(subPath);
      }
      return next;
    });
  };
  const submitInstall = () => {
    install.mutate({
      url: form.getValues('url'),
      ...(form.getValues('ref') ? { ref: form.getValues('ref') } : {}),
      revision: discovery.revision,
      selections: [...selected],
    });
  };

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto">
        <CandidateGroup
          title="Skills"
          candidates={container}
          selected={selected}
          onToggle={toggle}
        />
        {outside.length > 0 ? (
          <CandidateGroup
            title="Outside standard directories"
            candidates={outside}
            selected={selected}
            onToggle={toggle}
          />
        ) : null}
      </FieldGroup>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={install.isPending}
          onClick={() => setDiscovery(null)}
        >
          Back
        </Button>
        <Button
          type="button"
          disabled={selected.size < 1 || install.isPending}
          onClick={submitInstall}
        >
          {install.isPending
            ? 'Installing…'
            : `Install ${selected.size} skill${selected.size === 1 ? '' : 's'}`}
        </Button>
      </DialogFooter>
    </div>
  );
}

interface SearchHitsProps {
  hits: ReadonlyArray<SkillSearchHit>;
  disabled: boolean;
  onPick: (hit: SkillSearchHit) => void;
}

function SearchHits({ hits, disabled, onPick }: SearchHitsProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        Registry results
      </p>
      {hits.map((hit) => (
        <button
          key={hit.id}
          type="button"
          disabled={disabled}
          className="min-w-0 cursor-pointer rounded-md px-1 py-1 text-left hover:opacity-90 disabled:cursor-default disabled:opacity-60"
          onClick={() => onPick(hit)}
        >
          <span className="block truncate font-mono text-[13px] leading-5">{hit.name}</span>
          <span className="block truncate text-muted-foreground text-xs leading-4">
            {hit.source} · {hit.installs} installs
          </span>
        </button>
      ))}
    </div>
  );
}

interface CandidateGroupProps {
  title: string;
  candidates: SkillCandidate[];
  selected: ReadonlySet<string>;
  onToggle: (subPath: string, checked: boolean) => void;
}

function CandidateGroup({ title, candidates, selected, onToggle }: CandidateGroupProps) {
  if (candidates.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{title}</p>
      {candidates.map((candidate) => {
        const disabled = Boolean(candidate.invalidReason);
        const checked = selected.has(candidate.subPath);
        return (
          <div key={candidate.subPath} className="flex items-start gap-2 rounded-md px-1 py-1">
            <Checkbox
              checked={checked}
              disabled={disabled}
              onCheckedChange={(value) => onToggle(candidate.subPath, value === true)}
            />
            <button
              type="button"
              disabled={disabled}
              className={
                disabled
                  ? 'min-w-0 flex-1 text-left opacity-60'
                  : 'min-w-0 flex-1 cursor-pointer text-left hover:opacity-90'
              }
              onClick={() => onToggle(candidate.subPath, !checked)}
            >
              <span className="block truncate font-mono text-[13px] leading-5">
                {candidate.name}
              </span>
              <span className="block truncate text-muted-foreground text-xs leading-4">
                {candidate.invalidReason
                  ? `${candidate.description} — invalid: ${candidate.invalidReason}`
                  : `${candidate.description} (${candidate.subPath})`}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function openInstallSkillDialog(orgId: string) {
  return dialog.open<boolean, InstallSkillDialogData>(InstallSkillDialog, {
    title: 'Install skills from repository',
    description:
      'Search the skills registry or paste a git repository, then pick skills to copy into this organization.',
    className: 'sm:max-w-lg',
    testId: 'install-skill-dialog',
    data: { orgId },
  });
}
