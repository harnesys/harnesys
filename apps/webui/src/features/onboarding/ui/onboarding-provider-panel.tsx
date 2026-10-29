import type { DiscoveredModelView, Driver, ProviderPublic } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { mergeFields, resolveModelKind } from '@/features/manage-model';
import { persistedApiUrl } from '@/features/manage-project-settings/ui/provider-endpoint';
import {
  attachProviderModel,
  catalogQuery,
  createProvider,
  discoverProviderModels,
  listProviders,
} from '@/shared/api';
import { OnboardingPresetsStep } from './onboarding-presets-step';
import {
  OnboardingProviderConnect,
  type ProviderConnectDraft,
} from './onboarding-provider-connect';
import { OnboardingProviderModels } from './onboarding-provider-models';
import { OnboardingShell } from './onboarding-shell';

type Phase = 'connect' | 'models' | 'presets';

export function OnboardingProviderPanel({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const catalog = useQuery(catalogQuery).data;
  const [phase, setPhase] = useState<Phase>('connect');
  const [draft, setDraft] = useState<ProviderConnectDraft>({
    name: '',
    driver: 'openai' satisfies Driver,
    apiUrl: '',
    apiKey: '',
  });
  const [provider, setProvider] = useState<ProviderPublic | null>(null);
  const [found, setFound] = useState<DiscoveredModelView[] | null>(null);
  const [manualName, setManualName] = useState('');
  const [busy, setBusy] = useState(false);
  const [attaching, setAttaching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = catalog?.drivers.find((item) => item.id === draft.driver);

  const connect = async () => {
    const trimmed = draft.name.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const nextUrl = persistedApiUrl(
        selected?.endpoints ?? [],
        selected?.defaultUrl ?? '',
        draft.apiUrl,
      );
      const key = draft.apiKey.trim();
      const created = await createProvider(orgId, {
        name: trimmed,
        driver: draft.driver,
        ...(nextUrl ? { apiUrl: nextUrl } : {}),
        ...(key ? { apiKey: key } : {}),
        enabled: true,
      });
      setProvider(created);
      setPhase('models');
      try {
        const result = await discoverProviderModels(orgId, created.id);
        setFound(result.found);
      } catch (discoverError) {
        setFound([]);
        setError(
          discoverError instanceof Error
            ? discoverError.message
            : 'Discover failed. Attach a model by name or retry.',
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const refreshProvider = async (providerId: string) => {
    const rows = await listProviders(orgId);
    const next = rows.find((item) => item.id === providerId) ?? null;
    setProvider(next);
    return next;
  };

  const attachFound = async (item: DiscoveredModelView) => {
    if (!provider) {
      return;
    }
    setAttaching(item.name);
    setError(null);
    try {
      await attachProviderModel(orgId, provider.id, {
        name: item.name,
        kind: resolveModelKind(item.kind),
        metadata: mergeFields(item),
      });
      await refreshProvider(provider.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAttaching(null);
    }
  };

  const attachManual = async () => {
    if (!provider) {
      return;
    }
    const trimmed = manualName.trim();
    if (!trimmed) {
      setError('Model name is required');
      return;
    }
    setAttaching(trimmed);
    setError(null);
    try {
      await attachProviderModel(orgId, provider.id, {
        name: trimmed,
        kind: 'chat',
      });
      setManualName('');
      await refreshProvider(provider.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAttaching(null);
    }
  };

  const rediscover = async () => {
    if (!provider) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await discoverProviderModels(orgId, provider.id);
      setFound(result.found);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingShell testId="onboarding-provider">
      <div className="mx-auto w-full max-w-lg">
        {phase === 'presets' ? <OnboardingPresetsStep orgId={orgId} onDone={onDone} /> : null}
        {phase !== 'presets' && (phase === 'connect' || !provider) ? (
          <OnboardingProviderConnect
            catalog={catalog}
            draft={draft}
            busy={busy}
            error={error}
            onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
            onSubmit={() => void connect()}
          />
        ) : null}
        {phase === 'models' && provider ? (
          <OnboardingProviderModels
            provider={provider}
            found={found}
            manualName={manualName}
            busy={busy}
            attaching={attaching}
            error={error}
            onManualNameChange={setManualName}
            onDiscover={() => void rediscover()}
            onAttachFound={(item) => void attachFound(item)}
            onAttachManual={() => void attachManual()}
            onContinue={() => setPhase('presets')}
          />
        ) : null}
      </div>
    </OnboardingShell>
  );
}
