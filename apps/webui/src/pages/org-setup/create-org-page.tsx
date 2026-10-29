import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { OnboardingCreatePanel, OnboardingProviderPanel } from '@/features/onboarding';
import { useOrgStore } from '@/features/switch-org/org-context';
import { activateOrg } from '@/shared/api/orgs';
import { studioPath } from '@/shared/config/routes';
import { readOrgSetupFromState, resolveOrgSetupBackPath } from './org-setup-navigation';

export function CreateOrgPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { orgs, activeOrgId, upsertOrg, setActiveOrgId } = useOrgStore();
  const [providerOrgId, setProviderOrgId] = useState<string | null>(null);

  const goBack = () => {
    void navigate(
      resolveOrgSetupBackPath({
        from: readOrgSetupFromState(location.state),
        activeOrgId,
        orgs,
      }),
    );
  };

  const enterOrg = (orgId: string) => {
    setActiveOrgId(orgId);
    void activateOrg(orgId)
      .catch(() => undefined)
      .finally(() => {
        void navigate(studioPath.desk(orgId), { replace: true });
      });
  };

  if (providerOrgId) {
    return (
      <OnboardingProviderPanel
        orgId={providerOrgId}
        onDone={() => {
          const orgId = providerOrgId;
          setProviderOrgId(null);
          enterOrg(orgId);
        }}
      />
    );
  }

  return (
    <OnboardingCreatePanel
      onBack={goBack}
      onCreated={(entry) => {
        upsertOrg(entry);
        setProviderOrgId(entry.orgId);
      }}
    />
  );
}
