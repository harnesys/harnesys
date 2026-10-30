import { useNavigate } from 'react-router';
import { OnboardingChoose } from '@/features/onboarding';
import { studioPath } from '@/shared/config/routes';

export function OnboardingChoosePage() {
  const navigate = useNavigate();
  return (
    <OnboardingChoose
      onCreate={() => {
        void navigate(studioPath.onboardingCreate);
      }}
      onJoin={() => {
        void navigate(studioPath.onboardingJoin);
      }}
    />
  );
}
