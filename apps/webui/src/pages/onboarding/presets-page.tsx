import { Navigate, useNavigate, useParams } from 'react-router';
import { OnboardingPresetsStep } from '@/features/onboarding';
import { WIZARD_STEP_HINTS } from '@/features/onboarding/model/onboarding-copy';
import { wizardRail } from '@/features/onboarding/model/onboarding-steps';
import { useOnboardingWizard } from '@/features/onboarding/model/use-onboarding-progress';
import { OnboardingShell } from '@/features/onboarding/ui/onboarding-shell';
import { useOrgStore } from '@/features/switch-org/org-context';
import { activateOrg } from '@/shared/api/orgs';
import { studioPath } from '@/shared/config/routes';

export function OnboardingPresetsPage() {
  const { orgId } = useParams();
  const navigate = useNavigate();
  const { setActiveOrgId } = useOrgStore();
  const wizard = useOnboardingWizard(orgId);

  if (!orgId) {
    return <Navigate to={studioPath.onboardingChoose} replace />;
  }

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

  if (wizard.ready && wizard.wizard.agents) {
    return <Navigate to={studioPath.desk(orgId)} replace />;
  }
  const rail = wizardRail(wizard.ready ? wizard.wizard : null, 'agents');

  return (
    <OnboardingShell
      testId="onboarding-presets"
      steps={rail.labels}
      currentStep={rail.currentStep}
      hint={WIZARD_STEP_HINTS.agents}
    >
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
