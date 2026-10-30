import type { Driver } from '@harnesys/studio-shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { persistedApiUrl } from '@/features/manage-project-settings/ui/provider-endpoint';
import { OnboardingProviderConnect } from '@/features/onboarding';
import { ONBOARDING_STEP_LABELS } from '@/features/onboarding/model/onboarding-copy';
import { OnboardingShell } from '@/features/onboarding/ui/onboarding-shell';
import { catalogQuery, createProvider, listProviders } from '@/shared/api';
import { providersQueryKeyFor } from '@/shared/api/providers';
import { studioPath } from '@/shared/config/routes';

export function OnboardingProviderPage() {
  const { orgId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const catalog = useQuery(catalogQuery).data;
  const providersQuery = useQuery({
    queryKey: ['providers', orgId],
    queryFn: () => listProviders(orgId ?? ''),
    enabled: !!orgId,
  });
  const connected = providersQuery.data?.[0] ?? null;
  const [draft, setDraft] = useState<{
    name: string;
    driver: Driver;
    apiUrl: string;
    apiKey: string;
  }>({ name: '', driver: 'openai', apiUrl: '', apiKey: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = catalog?.drivers.find((item) => item.id === draft.driver);

  if (!orgId) {
    return <Navigate to={studioPath.onboardingChoose} replace />;
  }

  const connect = async () => {
    if (connected) {
      continueToModels();
      return;
    }
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
      await createProvider(orgId, {
        name: trimmed,
        driver: draft.driver,
        ...(nextUrl ? { apiUrl: nextUrl } : {}),
        ...(key ? { apiKey: key } : {}),
        enabled: true,
      });
      await queryClient.invalidateQueries({ queryKey: providersQueryKeyFor(orgId) });
      void navigate(studioPath.onboardingModels(orgId), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const continueToModels = () => {
    void navigate(studioPath.onboardingModels(orgId), { replace: true });
  };

  return (
    <OnboardingShell testId="onboarding-provider" steps={ONBOARDING_STEP_LABELS} currentStep={1}>
      <div className="mx-auto w-full max-w-lg">
        <OnboardingProviderConnect
          catalog={catalog}
          connected={connected}
          draft={draft}
          busy={busy}
          error={error}
          onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          onSubmit={() => void connect()}
          onContinue={continueToModels}
          onBack={() => {
            void navigate(studioPath.onboardingChoose, { replace: true });
          }}
        />
      </div>
    </OnboardingShell>
  );
}
