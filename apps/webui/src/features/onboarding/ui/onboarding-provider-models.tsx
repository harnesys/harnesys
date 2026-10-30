import type { DiscoveredModelView, ProviderPublic } from '@harnesys/studio-shared';
import { isSupportedKind } from '@/features/manage-model';
import { Button } from '@/shared/ui/button';
import { RowChip } from '@/shared/ui/capability-rows';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  ONBOARDING_BACK,
  PROVIDER_ATTACHED,
  PROVIDER_AVAILABLE,
  PROVIDER_CONTINUE,
  PROVIDER_DISCOVER,
  PROVIDER_DISCOVERING,
  PROVIDER_MANUAL_ATTACH,
  PROVIDER_MANUAL_HINT,
  PROVIDER_MANUAL_LABEL,
  PROVIDER_MODELS_BODY,
  PROVIDER_MODELS_TITLE,
} from '../model/onboarding-copy';

export function OnboardingProviderModels({
  provider,
  found,
  manualName,
  busy,
  attaching,
  error,
  onManualNameChange,
  onDiscover,
  onAttachFound,
  onAttachManual,
  onBack,
  onContinue,
}: {
  provider: ProviderPublic;
  found: DiscoveredModelView[] | null;
  manualName: string;
  busy: boolean;
  attaching: string | null;
  error: string | null;
  onManualNameChange: (value: string) => void;
  onDiscover: () => void;
  onAttachFound: (item: DiscoveredModelView) => void;
  onAttachManual: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const attachedNames = new Set(provider.models.map((item) => item.name));
  const available = (found ?? []).filter((item) => !attachedNames.has(item.name));
  const canContinue = provider.models.length > 0;

  return (
    <>
      <h1 className="font-semibold text-2xl tracking-[-0.03em] sm:text-3xl">
        {PROVIDER_MODELS_TITLE}
      </h1>
      <p className="mt-3 text-muted-foreground text-sm leading-relaxed">{PROVIDER_MODELS_BODY}</p>
      <p className="mt-2 font-mono text-muted-foreground text-xs">
        {provider.name} · {provider.driver}
      </p>

      <div className="mt-6 flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={onDiscover}
          data-testid="onboarding-provider-discover"
        >
          {busy ? PROVIDER_DISCOVERING : PROVIDER_DISCOVER}
        </Button>
        <span className="text-muted-foreground text-xs">
          {provider.models.length === 1
            ? '1 model attached'
            : `${provider.models.length} models attached`}
        </span>
      </div>

      {provider.models.length > 0 ? (
        <ModelList label={PROVIDER_ATTACHED} names={provider.models.map((item) => item.name)} />
      ) : null}

      {available.length > 0 ? (
        <div className="mt-5 flex flex-col gap-1">
          <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
            {PROVIDER_AVAILABLE}
            <span className="ml-2 font-mono normal-case">{available.length}</span>
          </p>
          {available.map((item) => {
            const supported = isSupportedKind(item.kind);
            return (
              <div
                key={item.name}
                className="flex min-h-9 items-center gap-2 rounded-md px-2 hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-sm">{item.name}</span>
                {item.kind !== 'chat' ? (
                  <RowChip tone={supported ? 'accent' : 'neutral'}>{item.kind}</RowChip>
                ) : null}
                {item.kind !== 'chat' && !supported ? <RowChip tone="neutral">soon</RowChip> : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={attaching === item.name || !supported}
                  title={supported ? undefined : 'Not supported yet'}
                  onClick={() => onAttachFound(item)}
                  data-testid={`onboarding-attach-${item.name}`}
                >
                  {attaching === item.name ? '…' : attachButtonLabel(supported)}
                </Button>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-2 border-border/70 border-t pt-5">
        <Label htmlFor="onboarding-manual-model">{PROVIDER_MANUAL_LABEL}</Label>
        <div className="flex gap-2">
          <Input
            id="onboarding-manual-model"
            value={manualName}
            className="font-mono"
            placeholder="gemma4:latest"
            onChange={(event) => onManualNameChange(event.target.value)}
            data-testid="onboarding-manual-model"
          />
          <Button
            type="button"
            variant="outline"
            disabled={!manualName.trim() || attaching !== null}
            onClick={onAttachManual}
            data-testid="onboarding-manual-attach"
          >
            {PROVIDER_MANUAL_ATTACH}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">{PROVIDER_MANUAL_HINT}</p>
      </div>

      {error ? <p className="mt-4 text-destructive text-sm">{error}</p> : null}

      <div className="mt-8 flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onBack}
          data-testid="onboarding-provider-back"
        >
          {ONBOARDING_BACK}
        </Button>
        <Button
          type="button"
          size="lg"
          disabled={!canContinue}
          className="flex-1 disabled:opacity-50"
          onClick={onContinue}
          data-testid="onboarding-provider-continue"
        >
          {PROVIDER_CONTINUE}
        </Button>
      </div>
    </>
  );
}

function attachButtonLabel(supported: boolean): string {
  return supported ? 'Attach' : 'Soon';
}

function ModelList({ label, names }: { label: string; names: string[] }) {
  return (
    <div className="mt-5 flex flex-col gap-1">
      <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
        <span className="ml-2 font-mono normal-case">{names.length}</span>
      </p>
      {names.map((name) => (
        <div key={name} className="flex min-h-9 items-center gap-2 rounded-md px-2">
          <span className="min-w-0 flex-1 truncate font-mono text-sm">{name}</span>
          <span className="font-mono text-[10px] text-muted-foreground uppercase">saved</span>
        </div>
      ))}
    </div>
  );
}
