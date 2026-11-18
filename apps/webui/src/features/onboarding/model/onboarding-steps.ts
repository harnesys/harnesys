import { WIZARD_STEP_LABELS } from './onboarding-copy';
import {
  type OnboardingWizardState,
  type OnboardingWizardStepId,
  remainingWizardSteps,
  WIZARD_STEP_ORDER,
} from './onboarding-progress';

export interface WizardRail {
  labels: string[];
  currentStep: number;
}

export const CREATE_RAIL: readonly string[] = [
  'Organization',
  ...WIZARD_STEP_ORDER.map((id) => WIZARD_STEP_LABELS[id]),
];

export function wizardRail(
  state: OnboardingWizardState | null,
  current: OnboardingWizardStepId,
): WizardRail {
  const ids = state ? remainingWizardSteps(state) : [...WIZARD_STEP_ORDER];
  const currentIndex = ids.indexOf(current);
  const fallbackIndex = WIZARD_STEP_ORDER.indexOf(current);
  return {
    labels: ids.map((id) => WIZARD_STEP_LABELS[id]),
    currentStep: currentIndex >= 0 ? currentIndex : Math.max(fallbackIndex, 0),
  };
}
