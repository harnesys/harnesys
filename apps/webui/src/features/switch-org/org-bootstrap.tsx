import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { OnboardingChoose, OnboardingError } from '@/features/onboarding';
import { useOrgStore } from '@/features/switch-org/org-context';
import { ApiError } from '@/shared/api/client';
import { listOrgs, type OrgsListResponse } from '@/shared/api/orgs';
import { notifySessionDead } from '@/shared/api/session';
import { studioPath } from '@/shared/config/routes';

function isAuthFailure(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status === 401 || err.status === 403;
  }
  if (err instanceof Error) {
    const message = err.message.toLowerCase();
    return message.includes('unauthorized') || message.includes('forbidden');
  }
  return false;
}

function pickActiveOrgId(response: OrgsListResponse): string | null {
  if (response.activeOrgId && response.orgs.some((row) => row.orgId === response.activeOrgId)) {
    return response.activeOrgId;
  }
  return response.orgs[0]?.orgId ?? null;
}

export function OrgBootstrap({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { ready, orgs, setOrgs, setActiveOrgId, setReady } = useOrgStore();
  const [error, setError] = useState<string | null>(null);
  const [showChoose, setShowChoose] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const bootstrappedRef = useRef(ready && orgs.length > 0);
  bootstrappedRef.current = ready && orgs.length > 0;

  useEffect(() => {
    // reset the store the first instance already filled: flipping ready to
    // false unmounts every org sync and re-fetches the whole desk.
    if (reloadKey === 0 && bootstrappedRef.current) {
      return;
    }
    const bootstrapGeneration = reloadKey;
    let cancelled = false;
    setReady(false);
    setError(null);

    const openOnboarding = () => {
      setOrgs([]);
      setActiveOrgId(null);
      setShowChoose(true);
      setError(null);
      setReady(true);
      if (window.location.pathname.startsWith('/o/')) {
        void navigate('/', { replace: true });
      }
    };

    const acceptOrgs = (response: OrgsListResponse) => {
      if (response.orgs.length === 0) {
        openOnboarding();
        return;
      }
      setOrgs(response.orgs);
      setActiveOrgId(pickActiveOrgId(response));
      setShowChoose(false);
      setError(null);
      setReady(true);
    };

    void listOrgs()
      .then((response) => {
        if (!cancelled && bootstrapGeneration === reloadKey) {
          acceptOrgs(response);
        }
      })
      .catch((err: unknown) => {
        if (cancelled || bootstrapGeneration !== reloadKey) {
          return;
        }
        if (isAuthFailure(err)) {
          if (err instanceof ApiError && err.status === 401) {
            notifySessionDead();
            return;
          }
          openOnboarding();
          return;
        }
        setError(err instanceof Error ? err.message : 'org bootstrap failed');
        setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey, navigate, setActiveOrgId, setOrgs, setReady]);

  if (error) {
    return (
      <OnboardingError
        message={error}
        onRetry={() => {
          setReloadKey((key) => key + 1);
        }}
        onSetup={() => {
          setOrgs([]);
          setActiveOrgId(null);
          setShowChoose(true);
          setError(null);
          if (location.pathname.startsWith('/o/')) {
            void navigate('/', { replace: true });
          }
        }}
      />
    );
  }
  if (!ready) {
    return null;
  }
  if (showChoose || orgs.length === 0) {
    return (
      <OnboardingChoose
        onCreate={() => {
          void navigate(studioPath.create);
        }}
        onJoin={() => {
          void navigate(studioPath.join);
        }}
      />
    );
  }
  return children;
}
