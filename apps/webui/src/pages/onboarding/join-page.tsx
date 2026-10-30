import { useNavigate } from 'react-router';
import { OnboardingJoinPanel } from '@/features/onboarding';
import { useOrgStore } from '@/features/switch-org/org-context';
import { activateOrg } from '@/shared/api/orgs';
import { studioPath } from '@/shared/config/routes';

export function OnboardingJoinPage() {
  const navigate = useNavigate();
  const { upsertOrg, setActiveOrgId, activeOrgId } = useOrgStore();

  const onBack = () => {
    void navigate(activeOrgId ? studioPath.desk(activeOrgId) : studioPath.onboardingChoose, {
      replace: true,
    });
  };

  return (
    <OnboardingJoinPanel
      onBack={onBack}
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
