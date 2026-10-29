import { useLocation, useNavigate } from 'react-router';
import { OnboardingJoinPanel } from '@/features/onboarding';
import { useOrgStore } from '@/features/switch-org/org-context';
import { activateOrg } from '@/shared/api/orgs';
import { studioPath } from '@/shared/config/routes';
import { readOrgSetupFromState, resolveOrgSetupBackPath } from './org-setup-navigation';

export function JoinOrgPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { orgs, activeOrgId, upsertOrg, setActiveOrgId } = useOrgStore();

  const goBack = () => {
    void navigate(
      resolveOrgSetupBackPath({
        from: readOrgSetupFromState(location.state),
        activeOrgId,
        orgs,
      }),
    );
  };

  return (
    <OnboardingJoinPanel
      onBack={goBack}
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
