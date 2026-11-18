import { studioPath } from '@/shared/config/routes';
import {
  nextWizardStep,
  type OnboardingWizardState,
  type OnboardingWizardStepId,
} from './onboarding-progress';

export function wizardStepRoute(orgId: string, step: OnboardingWizardStepId): string {
  if (step === 'provider') {
    return studioPath.onboardingProvider(orgId);
  }
  if (step === 'models') {
    return studioPath.onboardingModels(orgId);
  }
  return studioPath.onboardingPresets(orgId);
}

export function nextWizardRoute(
  orgId: string,
  state: OnboardingWizardState,
  after?: OnboardingWizardStepId,
): string {
  const next = nextWizardStep(state, after);
  return next ? wizardStepRoute(orgId, next) : studioPath.desk(orgId);
}
