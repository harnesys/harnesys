import type { AgentPresetDetail } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { BotIcon, CheckIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { agentColorTintClass } from '@/entities/agent';
import { createAgentFromPreset } from '@/features/manage-agent';
import { ModelSelect } from '@/features/manage-agent/ui/model-select';
import { presetCapabilityNames } from '@/features/preset-marketplace';
import { listPresetDetails } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/toast';
import {
  ONBOARDING_BACK,
  PRESETS_CREATE,
  PRESETS_DEFAULT_BADGE,
  PRESETS_DEFAULT_PRESET_ID,
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
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [modelId, setModelId] = useState('');
  const [busy, setBusy] = useState(false);

  const detailsQuery = useQuery({
    queryKey: ['presets', 'agent-details', orgId],
    queryFn: async (): Promise<AgentPresetDetail[]> => {
      const list = await listPresetDetails({ kind: 'agent' });
      return list.filter((item): item is AgentPresetDetail => item.kind === 'agent');
    },
  });
  const details = sortDefaultFirst(detailsQuery.data ?? []);

  const isDefault = (id: string) => id === PRESETS_DEFAULT_PRESET_ID;
  const isPicked = (id: string) => isDefault(id) || pickedIds.includes(id);

  const pick = (id: string) => {
    if (isDefault(id)) {
      return;
    }
    setPickedIds((prev) =>
      prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id],
    );
  };

  let listBody: ReactNode;
  if (detailsQuery.isLoading) {
    listBody = [0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-[86px] w-full" />);
  } else if (details.length === 0) {
    listBody = (
      <p className="px-2 py-8 text-center text-muted-foreground text-xs">No agent presets found.</p>
    );
  } else {
    listBody = details.map((item) => (
      <AgentPresetCard
        key={item.id}
        detail={item}
        isDefault={isDefault(item.id)}
        isPicked={isPicked(item.id)}
        onPick={isDefault(item.id) ? undefined : () => pick(item.id)}
      />
    ));
  }

  const create = async () => {
    setBusy(true);
    const trimmedModelId = modelId.trim();
    for (const item of details) {
      if (!isPicked(item.id)) {
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
      <button
        type="button"
        onClick={onBack}
        className="mb-8 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        data-testid="onboarding-back"
      >
        ← {ONBOARDING_BACK}
      </button>
      <h1 className="font-semibold text-2xl tracking-[-0.03em] sm:text-3xl">
        {PRESETS_STEP_TITLE}
      </h1>
      <p className="mt-3 text-muted-foreground text-sm leading-relaxed">{PRESETS_STEP_BODY}</p>

      <div className="mt-5 flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">{PRESETS_MODEL_LABEL}</span>
        <ModelSelect
          value={modelId || null}
          onChange={(value) => setModelId(value ?? '')}
          orgId={orgId}
          triggerClassName="w-full"
        />
        <span className="text-muted-foreground/70 text-xs">{PRESETS_MODEL_HINT}</span>
      </div>

      <div
        className="mt-6 flex max-h-[396px] flex-col gap-2 overflow-y-auto p-1.5"
        data-testid="onboarding-agent-grid"
      >
        {listBody}
      </div>

      <div className="mt-6 flex items-center gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          {PRESETS_SKIP}
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={busy || details.length === 0}
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

function AgentPresetCard({
  detail,
  isDefault,
  isPicked,
  onPick,
}: {
  detail: AgentPresetDetail;
  isDefault: boolean;
  isPicked: boolean;
  onPick?: () => void;
}) {
  const color = agentColorTintClass(detail.body.color ?? null);
  const capabilities = presetCapabilityNames(detail.body);

  return (
    <button
      type="button"
      aria-pressed={isPicked}
      disabled={isDefault}
      data-testid={`onboarding-agent-tile-${detail.id}`}
      className={`flex w-full shrink-0 items-start gap-3 rounded-xl border bg-popover p-3 text-left outline-none transition-all ${
        isDefault
          ? 'border-border'
          : 'hover:border-foreground/20 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/50'
      } ${isPicked ? 'border-foreground/40 bg-accent/50 ring-2 ring-live' : 'border-border'}`}
      onClick={onPick}
    >
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${color}`}>
        <BotIcon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-medium text-sm">
          <span className="truncate">{detail.name}</span>
          {isDefault ? <DefaultBadge /> : null}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">
          {detail.role}
          {capabilities.length > 0 ? ` · ${capabilities.length} capabilities` : ''}
        </span>
        {detail.description ? (
          <span className="mt-1 line-clamp-2 block text-muted-foreground text-xs/relaxed">
            {detail.description}
          </span>
        ) : null}
      </span>
      <span
        className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full transition-colors ${
          isPicked ? 'border-live bg-live text-background' : 'border-border text-muted-foreground'
        }`}
      >
        {isPicked ? <CheckIcon className="size-3" /> : null}
      </span>
    </button>
  );
}

function DefaultBadge() {
  return (
    <span className="shrink-0 rounded-full bg-foreground/10 px-2 py-0 font-medium text-[10px] text-foreground">
      {PRESETS_DEFAULT_BADGE}
    </span>
  );
}

function sortDefaultFirst(details: AgentPresetDetail[]): AgentPresetDetail[] {
  return [...details].sort((left, right) => {
    const leftDefault = left.id === PRESETS_DEFAULT_PRESET_ID ? 0 : 1;
    const rightDefault = right.id === PRESETS_DEFAULT_PRESET_ID ? 0 : 1;
    if (leftDefault !== rightDefault) {
      return leftDefault - rightDefault;
    }
    return left.name.localeCompare(right.name);
  });
}
