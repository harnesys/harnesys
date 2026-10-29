import { Navigate, useNavigate } from 'react-router';
import { useOrgStore } from '@/features/switch-org/org-context';
import { RelayLinkPanel } from './relay-link-panel';

export function WorkerRelayPage() {
  const navigate = useNavigate();
  const { ready, orgs, activeOrgId } = useOrgStore();
  if (!ready) {
    return null;
  }
  const entry =
    orgs.find((row) => row.orgId === activeOrgId) ?? orgs.find((row) => row.role === 'worker');
  if (!entry) {
    return <Navigate to="/" replace />;
  }
  return (
    <RelayLinkPanel
      entry={entry}
      onPairAnother={() => {
        void navigate('/join');
      }}
    />
  );
}
