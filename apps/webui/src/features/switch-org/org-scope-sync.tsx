import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useOrgStore } from '@/features/switch-org/org-context';
import { setCurrentOrgId } from '@/shared/api/active-org';
import { activateOrg } from '@/shared/api/orgs';
import { studioPath } from '@/shared/config/routes';

export function OrgScopeSync() {
  const { orgId } = useParams();
  const navigate = useNavigate();
  const { ready, orgs, activeOrgId, setActiveOrgId } = useOrgStore();
  const activatingRef = useRef<string | null>(null);

  useEffect(() => {
    setCurrentOrgId(orgId ?? null);
  }, [orgId]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    if (orgs.length === 0) {
      if (orgId) {
        void navigate('/', { replace: true });
      }
      return;
    }
    if (!orgId) {
      return;
    }
    const known = orgs.some((row) => row.orgId === orgId);
    if (!known) {
      const fallback =
        activeOrgId && orgs.some((row) => row.orgId === activeOrgId)
          ? activeOrgId
          : (orgs[0]?.orgId ?? null);
      if (fallback) {
        void navigate(studioPath.desk(fallback), { replace: true });
      } else {
        void navigate('/', { replace: true });
      }
      return;
    }
    if (orgId === activeOrgId) {
      return;
    }
    if (activatingRef.current === orgId) {
      return;
    }
    activatingRef.current = orgId;
    setActiveOrgId(orgId);
    setCurrentOrgId(orgId);
    void activateOrg(orgId)
      .catch(() => undefined)
      .finally(() => {
        if (activatingRef.current === orgId) {
          activatingRef.current = null;
        }
      });
  }, [ready, orgId, orgs, activeOrgId, navigate, setActiveOrgId]);

  return null;
}
