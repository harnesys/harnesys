import type { PresetDetail, PresetEnvelope, PresetKind, PresetOrigin } from '@harnesys/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DownloadIcon, PlusIcon, SparklesIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useActiveOrgStore } from '@/entities/org-machine';
import { openAgentConfigDialog } from '@/features/manage-agent/model/agent-dialogs';
import { createAgent } from '@/features/manage-agent/model/create-agent';
import { updateAgentCapabilities } from '@/features/manage-agent/model/update-agent';
import { importPresets, presetDetailsQuery } from '@/shared/api';
import { useOrgId } from '@/shared/config/location';
import { type DialogComponentProps, dialog } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/toast';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';
import { catalogSearchText } from '../model/preset-mappers';
import { openComposeTeamPresetDialog } from './compose-team-preset-dialog';
import { PresetCard } from './preset-card';
import { PresetDetailPanel } from './preset-detail';

export interface MarketplaceOptions {
  kind?: PresetKind;
  origin?: PresetOrigin;
  onCreated?: () => void;
}

type OriginFilter = 'all' | 'user' | 'system' | 'registry';

const ORIGIN_FILTERS: { key: OriginFilter; label: string; disabled?: boolean; title?: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'user', label: 'Mine' },
  { key: 'system', label: 'System' },
  {
    key: 'registry',
    label: 'Registry',
    disabled: true,
    title: 'Available with the preset registry',
  },
];

export function openMarketplace(options: MarketplaceOptions = {}) {
  return dialog.open(MarketplaceDialog, {
    title: 'Presets',
    className: 'sm:max-h-[86vh] sm:max-w-5xl',
    testId: 'preset-marketplace',
    data: options,
  });
}

function MarketplaceDialog({ data }: DialogComponentProps<void, MarketplaceOptions>) {
  const queryClient = useQueryClient();
  const urlOrgId = useOrgId();
  const storeOrgId = useActiveOrgStore((state) => state.orgId);
  const orgId = urlOrgId ?? storeOrgId ?? '';
  const [search, setSearch] = useState('');
  const [originFilter, setOriginFilter] = useState<OriginFilter>(data?.origin ?? 'all');
  const [selected, setSelected] = useState<{ kind: PresetKind; id: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const listQuery = useQuery(presetDetailsQuery(data?.kind ? { kind: data.kind } : undefined));
  const presets = listQuery.data ?? [];
  const visible = presets.filter((preset) => {
    if (originFilter !== 'all' && preset.origin !== originFilter) {
      return false;
    }
    if (search.trim() === '') {
      return true;
    }
    return catalogSearchText(preset).includes(search.trim().toLowerCase());
  });

  const selectedPreset = selected
    ? (presets.find((preset) => preset.kind === selected.kind && preset.id === selected.id) ?? null)
    : null;

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const envelope = JSON.parse(text) as PresetEnvelope;
      const result = await importPresets(envelope);
      await queryClient.invalidateQueries({ queryKey: ['presets'] });
      toast.add({ title: `Imported ${result.items.length} preset(s)` });
    } catch (error) {
      toast.add({ title: error instanceof Error ? error.message : 'Import failed' });
    } finally {
      setImporting(false);
    }
  };

  const handleBlankAgent = async () => {
    const result = await openAgentConfigDialog(null, orgId);
    if (!result) {
      return;
    }
    try {
      const created = await createAgent(orgId, result.fields);
      if (!created) {
        return;
      }
      await updateAgentCapabilities(orgId, created.agent.id, result.capabilities);
      data?.onCreated?.();
    } catch (error) {
      toast.add({ title: error instanceof Error ? error.message : 'Could not create agent' });
    }
  };

  const toggle = (preset: PresetDetail) => {
    setSelected((prev) =>
      prev && prev.kind === preset.kind && prev.id === preset.id
        ? null
        : { kind: preset.kind, id: preset.id },
    );
  };

  const isSelected = (preset: PresetDetail) =>
    selected?.kind === preset.kind && selected.id === preset.id;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setSelected(null);
          }}
          placeholder="Search presets"
          aria-label="Search presets"
          className="h-7 w-full sm:w-60"
        />
        <ToggleGroup
          aria-label="Origin filter"
          variant="segment"
          size="sm"
          value={[originFilter]}
          onValueChange={(value) => {
            const next = value[0];
            if (next === 'all' || next === 'user' || next === 'system' || next === 'registry') {
              setOriginFilter(next);
              setSelected(null);
            }
          }}
        >
          {ORIGIN_FILTERS.map((filter) => (
            <ToggleGroupItem
              key={filter.key}
              value={filter.key}
              disabled={filter.disabled}
              title={filter.title}
            >
              {filter.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="h-7"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            <DownloadIcon data-icon="inline-start" />
            Import
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="h-7"
            onClick={() => {
              void handleBlankAgent();
            }}
          >
            <PlusIcon data-icon="inline-start" />
            New from scratch
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="h-7"
            onClick={() => {
              void openComposeTeamPresetDialog(orgId);
            }}
          >
            <SparklesIcon data-icon="inline-start" />
            New preset
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          data-testid="preset-import-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) {
              void handleImport(file);
            }
          }}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {listQuery.isLoading ? (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((key) => (
              <Skeleton key={key} className="h-[148px] w-full" />
            ))}
          </div>
        ) : null}
        {!listQuery.isLoading && visible.length === 0 ? (
          <p className="px-2 py-8 text-center text-muted-foreground text-xs">No presets found.</p>
        ) : null}
        {!listQuery.isLoading && visible.length > 0 ? (
          <div className="grid grid-cols-1 items-stretch gap-2.5 sm:grid-cols-3">
            {visible.map((preset) => (
              <PresetCard
                key={`${preset.kind}:${preset.id}`}
                preset={preset}
                selected={isSelected(preset)}
                onOpen={() => toggle(preset)}
              />
            ))}
          </div>
        ) : null}
      </div>
      {selectedPreset ? (
        <div
          className="fade-in-0 slide-in-from-bottom-1 max-h-[55vh] shrink-0 animate-in overflow-y-auto rounded-xl border border-border/60 bg-muted/40 p-3 duration-150"
          data-testid="preset-detail"
        >
          <PresetDetailPanel
            detail={selectedPreset}
            orgId={orgId}
            onClose={() => setSelected(null)}
            onDone={() => {
              data?.onCreated?.();
              setSelected(null);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
