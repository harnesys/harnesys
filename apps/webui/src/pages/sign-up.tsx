import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { OnboardingSignUpPanel } from '@/features/onboarding';
import { sessionOwnerStatus } from '@/shared/api/session';

export function SignUpPage() {
  const navigate = useNavigate();
  const [initialized, setInitialized] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void sessionOwnerStatus().then((value) => {
      if (!cancelled) {
        setInitialized(value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (initialized === null) {
    return null;
  }
  if (initialized) {
    return <Navigate to="/login" replace />;
  }
  return (
    <OnboardingSignUpPanel
      onReady={() => {
        void navigate('/', { replace: true });
      }}
    />
  );
}
