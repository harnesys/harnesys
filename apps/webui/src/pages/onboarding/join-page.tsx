import { useNavigate } from 'react-router';
import { OnboardingJoinPanel } from '@/features/onboarding';
import { useOrgStore } from '@/features/switch-org/org-context';
import { activateOrg } from '@/shared/api/orgs';
import { studioPath } from '@/shared/config/routes';

export function OnboardingJoinPage() {
  const navigate = useNavigate();
  const { upsertOrg, setActiveOrgId } = useOrgStore();

  return (
    <OnboardingJoinPanel
      onBack={() => {
        void navigate(studioPath.onboardingChoose, { replace: true });
      }}
      onJoined={(entry) => {
        upsertOrg(entry);
        setActiveOrgId(entry.orgId);
        void activateOrg(entry.orgId)
          .catch(() => undefined)
          .finally(() => {
            if (entry.role === 'worker') {
              void navigate('/worker', { replace: true });
              return;
            }
            void navigate(studioPath.desk(entry.orgId), { replace: true });
          });
      }}
    />
  );
}
