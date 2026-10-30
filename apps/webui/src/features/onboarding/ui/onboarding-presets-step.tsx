import type { CatalogItem } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { createAgentFromPreset } from '@/features/manage-agent/model/create-agent-from-preset';
import { ModelSelect } from '@/features/manage-agent/ui/model-select';
import { PresetCard } from '@/features/preset-marketplace';
import { listPresets } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
import {
  ONBOARDING_BACK,
  PRESETS_CREATE,
  PRESETS_MODEL_HINT,
  PRESETS_MODEL_LABEL,
  PRESETS_SKIP,
  PRESETS_STEP_BODY,
  PRESETS_STEP_TITLE,
} from '../model/onboarding-copy';

export function OnboardingPresetsStep({
  orgId,
  onBack,
  onDone,
}: {
  orgId: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [modelId, setModelId] = useState('');
  const [busy, setBusy] = useState(false);
  const presetsQuery = useQuery({
    queryKey: ['presets'],
    queryFn: () => listPresets(),
  });
  const items = (presetsQuery.data ?? []).filter(isAgentPreset);

  const toggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const create = async () => {
    setBusy(true);
    const trimmedModelId = modelId.trim();
    for (const id of selectedIds) {
      const item = items.find((entry) => entry.id === id);
      if (!item) {
        continue;
      }
      try {
        await createAgentFromPreset(orgId, item.id, {
          ...(trimmedModelId ? { modelId: trimmedModelId } : {}),
        });
      } catch (error) {
        toast.add({
          title: error instanceof Error ? error.message : `Could not create ${item.name}`,
        });
      }
    }
    setBusy(false);
    onDone();
  };

  return (
    <>
      <h1 className="font-semibold text-2xl tracking-[-0.03em] sm:text-3xl">
        {PRESETS_STEP_TITLE}
      </h1>
      <p className="mt-3 text-muted-foreground text-sm leading-relaxed">{PRESETS_STEP_BODY}</p>

      <div className="mt-6 flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">{PRESETS_MODEL_LABEL}</span>
        <ModelSelect
          value={modelId || null}
          onChange={(value) => setModelId(value ?? '')}
          orgId={orgId}
          triggerClassName="w-full"
          size="sm"
        />
        <span className="text-muted-foreground/70 text-xs">{PRESETS_MODEL_HINT}</span>
      </div>

      <div className="mt-4 grid max-h-64 grid-cols-1 gap-2 overflow-y-auto p-0.5 sm:grid-cols-2">
        {items.map((item) => (
          <PresetCard
            key={item.id}
            item={item}
            selected={selectedIds.includes(item.id)}
            onOpen={() => toggle(item.id)}
          />
        ))}
      </div>

      <div className="mt-6 flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          {ONBOARDING_BACK}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          {PRESETS_SKIP}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || selectedIds.length === 0}
          data-testid="onboarding-presets-create"
          onClick={() => {
            void create();
          }}
        >
          {PRESETS_CREATE}
        </Button>
      </div>
    </>
  );
}

function isAgentPreset(item: CatalogItem): boolean {
  return item.kind === 'agent';
}
