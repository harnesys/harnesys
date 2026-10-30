import { useNavigate, useParams } from 'react-router';
import { OnboardingPresetsStep } from '@/features/onboarding';
import { ONBOARDING_STEP_LABELS } from '@/features/onboarding/model/onboarding-copy';
import { OnboardingShell } from '@/features/onboarding/ui/onboarding-shell';
import { useOrgStore } from '@/features/switch-org/org-context';
import { activateOrg } from '@/shared/api/orgs';
import { studioPath } from '@/shared/config/routes';

export function OnboardingPresetsPage() {
  const { orgId } = useParams();
  const navigate = useNavigate();
  const { setActiveOrgId } = useOrgStore();

  const enterOrg = () => {
    if (!orgId) {
      return;
    }
    setActiveOrgId(orgId);
    void activateOrg(orgId)
      .catch(() => undefined)
      .finally(() => {
        void navigate(studioPath.desk(orgId), { replace: true });
      });
  };

  return (
    <OnboardingShell testId="onboarding-presets" steps={ONBOARDING_STEP_LABELS} currentStep={3}>
      <div className="mx-auto w-full max-w-lg">
        <OnboardingPresetsStep
          orgId={orgId}
          onBack={() => {
            void navigate(studioPath.onboardingModels(orgId), { replace: true });
          }}
          onDone={enterOrg}
        />
      </div>
    </OnboardingShell>
  );
}
