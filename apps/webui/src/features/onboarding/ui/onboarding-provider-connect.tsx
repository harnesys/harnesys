import type { Driver, ProviderPublic, StudioCatalog } from '@harnesys/studio-shared';
import { isDriver } from '@harnesys/studio-shared';
import { CheckIcon } from 'lucide-react';
import { DRIVER_ITEMS } from '@/features/manage-project-settings/ui/driver-items';
import { ProviderEndpointFields } from '@/features/manage-project-settings/ui/provider-endpoint';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import {
  ONBOARDING_BACK,
  PROVIDER_CONNECT_SUBMIT,
  PROVIDER_CONNECTED_ANOTHER,
  PROVIDER_CONNECTED_CONTINUE,
  PROVIDER_KEY_HINT,
  PROVIDER_KEY_LABEL,
  PROVIDER_NAME_HINT,
  PROVIDER_NAME_LABEL,
  PROVIDER_PANEL_BODY,
  PROVIDER_PANEL_TITLE,
} from '../model/onboarding-copy';

export interface ProviderConnectDraft {
  name: string;
  driver: Driver;
  apiUrl: string;
  apiKey: string;
}

export function OnboardingProviderConnect({
  catalog,
  connected,
  draft,
  busy,
  error,
  onChange,
  onSubmit,
  onContinue,
  onBack,
}: {
  catalog: StudioCatalog | undefined;
  connected?: ProviderPublic | null;
  draft: ProviderConnectDraft;
  busy: boolean;
  error: string | null;
  onChange: (patch: Partial<ProviderConnectDraft>) => void;
  onSubmit: () => void;
  onContinue?: () => void;
  onBack: () => void;
}) {
  const selected = catalog?.drivers.find((item) => item.id === draft.driver);
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
        {PROVIDER_PANEL_TITLE}
      </h1>
      <p className="mt-3 text-muted-foreground text-sm leading-relaxed">
        {connected ? PROVIDER_CONNECTED_ANOTHER : PROVIDER_PANEL_BODY}
      </p>

      {connected ? (
        <div
          className="mt-5 flex items-center gap-3 rounded-xl border px-3 py-3"
          data-testid="onboarding-provider-connected"
        >
          <span className="text-live" title="Connected">
            <CheckIcon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-sm">{connected.name}</p>
            <p className="truncate font-mono text-muted-foreground text-xs">
              {connected.driver} · {connected.models.length}{' '}
              {connected.models.length === 1 ? 'model' : 'models'}
            </p>
          </div>
          {onContinue ? (
            <Button
              type="button"
              size="sm"
              onClick={onContinue}
              data-testid="onboarding-provider-connected-continue"
            >
              {PROVIDER_CONNECTED_CONTINUE}
            </Button>
          ) : null}
        </div>
      ) : null}

      <form
        className="mt-8 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="onboarding-provider-name">{PROVIDER_NAME_LABEL}</Label>
          <Input
            id="onboarding-provider-name"
            value={draft.name}
            autoFocus
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="ollama"
            data-testid="onboarding-provider-name"
          />
          <p className="text-muted-foreground text-xs">{PROVIDER_NAME_HINT}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="onboarding-provider-driver">Driver</Label>
          <Select
            items={DRIVER_ITEMS}
            value={draft.driver}
            onValueChange={(value) => {
              if (value && isDriver(value)) {
                onChange({ driver: value, apiUrl: '' });
              }
            }}
          >
            <SelectTrigger id="onboarding-provider-driver" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {DRIVER_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <ProviderEndpointFields
          apiUrl={draft.apiUrl}
          idPrefix="onboarding-provider"
          endpoints={selected?.endpoints ?? []}
          defaultUrl={selected?.defaultUrl ?? ''}
          onApiUrlChange={(apiUrl) => onChange({ apiUrl })}
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor="onboarding-provider-key">{PROVIDER_KEY_LABEL}</Label>
          <Input
            id="onboarding-provider-key"
            type="password"
            value={draft.apiKey}
            autoComplete="off"
            className="font-mono"
            onChange={(event) => onChange({ apiKey: event.target.value })}
            placeholder="sk-…"
            data-testid="onboarding-provider-key"
          />
          <p className="text-muted-foreground text-xs">{PROVIDER_KEY_HINT}</p>
        </div>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Button
          type="submit"
          className="w-full"
          disabled={busy}
          data-testid="onboarding-provider-connect"
        >
          {busy ? 'Connecting…' : PROVIDER_CONNECT_SUBMIT}
        </Button>
      </form>
    </>
  );
}
