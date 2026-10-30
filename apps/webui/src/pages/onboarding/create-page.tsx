import { useNavigate } from 'react-router';
import { OnboardingCreatePanel } from '@/features/onboarding';
import { useOrgStore } from '@/features/switch-org/org-context';
import { activateOrg, type MachineOrgEntry } from '@/shared/api/orgs';
import { studioPath } from '@/shared/config/routes';

export function OnboardingCreatePage() {
  const navigate = useNavigate();
  const { upsertOrg, setActiveOrgId } = useOrgStore();

  const onCreated = (entry: MachineOrgEntry) => {
    upsertOrg(entry);
    setActiveOrgId(entry.orgId);
    void activateOrg(entry.orgId)
      .catch(() => undefined)
      .finally(() => {
        void navigate(studioPath.onboardingProvider(entry.orgId), { replace: true });
      });
  };

  return (
    <OnboardingCreatePanel
      onBack={() => {
        void navigate(studioPath.onboardingChoose, { replace: true });
      }}
      onCreated={onCreated}
    />
  );
}
