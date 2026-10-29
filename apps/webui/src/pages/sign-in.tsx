import { Navigate, useNavigate } from 'react-router';
import { OnboardingSignInPanel } from '@/features/onboarding';
import { getAccess } from '@/shared/api/session';

export function SignInPage() {
  const navigate = useNavigate();
  if (getAccess()) {
    return <Navigate to="/" replace />;
  }
  return (
    <OnboardingSignInPanel
      onReady={() => {
        void navigate('/', { replace: true });
      }}
    />
  );
}
