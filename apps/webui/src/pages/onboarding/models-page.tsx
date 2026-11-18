import type {
  DiscoveredModelView,
  ProviderModelPublic,
  ProviderPublic,
} from '@harnesys/studio-shared';
import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { mergeFields, resolveModelKind } from '@/features/manage-model';
import { OnboardingProviderModels } from '@/features/onboarding';
import { WIZARD_STEP_HINTS } from '@/features/onboarding/model/onboarding-copy';
import { wizardRail } from '@/features/onboarding/model/onboarding-steps';
import { useOnboardingWizard } from '@/features/onboarding/model/use-onboarding-progress';
import { nextWizardRoute } from '@/features/onboarding/model/wizard-route';
import { OnboardingShell } from '@/features/onboarding/ui/onboarding-shell';
import { attachProviderModel, discoverProviderModels } from '@/shared/api';
import { providersQueryKeyFor } from '@/shared/api/providers';
import { studioPath } from '@/shared/config/routes';
import { Spinner } from '@/shared/ui/spinner';

export function OnboardingModelsPage() {
  const { orgId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const wizard = useOnboardingWizard(orgId);
  const [entryWasComplete, setEntryWasComplete] = useState<boolean | null>(null);
  const [manualName, setManualName] = useState('');
  const [attaching, setAttaching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const provider: ProviderPublic | null = wizard.providers[0] ?? null;
  const providerId = provider?.id ?? null;

  // Discovery runs automatically once the connected provider is known;
  // the Discover button re-runs the same query.
  const discoveryQuery = useQuery({
    queryKey: ['onboarding', 'model-discovery', orgId, providerId],
    queryFn: async () => {
      if (!orgId || !providerId) {
        throw new Error('No provider selected');
      }
      return discoverProviderModels(orgId, providerId);
    },
    enabled: !!orgId && !!providerId,
  });

  useEffect(() => {
    if (wizard.ready && entryWasComplete === null) {
      setEntryWasComplete(wizard.wizard.models);
    }
  }, [wizard.ready, wizard.wizard.models, entryWasComplete]);

  const attachFound = async (item: DiscoveredModelView) => {
    if (!orgId || !providerId) {
      return;
    }
    setAttaching(item.name);
    setError(null);
    try {
      const model = await attachProviderModel(orgId, providerId, {
        name: item.name,
        kind: resolveModelKind(item.kind),
        metadata: mergeFields(item),
      });
      applyAttachedModel(orgId, providerId, model, queryClient);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setAttaching(null);
    }
  };

  const attachManual = async () => {
    if (!orgId || !providerId) {
      return;
    }
    const trimmed = manualName.trim();
    if (!trimmed) {
      return;
    }
    setAttaching(trimmed);
    setError(null);
    try {
      const model = await attachProviderModel(orgId, providerId, { name: trimmed, kind: 'chat' });
      setManualName('');
      applyAttachedModel(orgId, providerId, model, queryClient);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setAttaching(null);
    }
  };

  if (!orgId) {
    return <Navigate to={studioPath.onboardingChoose} replace />;
  }
  if (entryWasComplete) {
    return <Navigate to={nextWizardRoute(orgId, wizard.wizard, 'models')} replace />;
  }
  if (wizard.ready && !provider) {
    return <Navigate to={studioPath.onboardingProvider(orgId)} replace />;
  }
  const rail = wizardRail(wizard.ready ? wizard.wizard : null, 'models');
  if (!provider) {
    return (
      <OnboardingShell
        testId="onboarding-models"
        steps={rail.labels}
        currentStep={rail.currentStep}
        hint={WIZARD_STEP_HINTS.models}
      >
        <div className="mx-auto flex w-full max-w-lg justify-center py-16">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      </OnboardingShell>
    );
  }

  const discoveryError = toMessage(discoveryQuery.error);

  return (
    <OnboardingShell
      testId="onboarding-models"
      steps={rail.labels}
      currentStep={rail.currentStep}
      hint={WIZARD_STEP_HINTS.models}
    >
      <div className="mx-auto w-full max-w-lg">
        <OnboardingProviderModels
          provider={provider}
          found={discoveryQuery.data?.found ?? null}
          manualName={manualName}
          busy={discoveryQuery.isFetching}
          attaching={attaching}
          error={error ?? discoveryError}
          onManualNameChange={setManualName}
          onDiscover={() => void discoveryQuery.refetch()}
          onAttachFound={(item) => void attachFound(item)}
          onAttachManual={() => void attachManual()}
          onBack={() => {
            void navigate(studioPath.onboardingProvider(orgId), { replace: true });
          }}
          onContinue={() => {
            void navigate(studioPath.onboardingPresets(orgId), { replace: true });
          }}
          onSkip={() => {
            void navigate(studioPath.onboardingPresets(orgId), { replace: true });
          }}
        />
      </div>
    </OnboardingShell>
  );
}

function toMessage(err: unknown): string | null {
  if (err instanceof Error) {
    return err.message;
  }
  return err ? String(err) : null;
}

function applyAttachedModel(
  orgId: string,
  providerId: string,
  model: ProviderModelPublic,
  queryClient: QueryClient,
): void {
  queryClient.setQueryData<ProviderPublic[]>(providersQueryKeyFor(orgId), (rows) =>
    rows?.map((row) => (row.id === providerId ? { ...row, models: [...row.models, model] } : row)),
  );
}
