import type { IssueRecord, ProviderPublic } from '@harnesys/studio-shared';
import type { IssueBoardRecord } from '@/shared/api';

export type OnboardingWizardStepId = 'provider' | 'models' | 'agents';

export type OnboardingChecklistKey =
  | OnboardingWizardStepId
  | 'dashboard'
  | 'board'
  | 'issue'
  | 'issueDone';

export interface OnboardingWizardState {
  provider: boolean;
  models: boolean;
  agents: boolean;
}

export interface OnboardingSignals {
  providers: readonly ProviderPublic[];
  agentCount: number;
  dashboardCount: number;
  boards: readonly IssueBoardRecord[];
  issues: readonly IssueRecord[];
}

export interface OnboardingChecklistItem {
  key: OnboardingChecklistKey;
  done: boolean;
}

export interface OnboardingChecklist {
  items: OnboardingChecklistItem[];
  done: number;
  total: number;
  complete: boolean;
}

export const WIZARD_STEP_ORDER: readonly OnboardingWizardStepId[] = [
  'provider',
  'models',
  'agents',
];

export const ONBOARDING_CHECKLIST_ORDER: readonly OnboardingChecklistKey[] = [
  'provider',
  'models',
  'agents',
  'board',
  'issue',
  'issueDone',
  'dashboard',
];

export function wizardStateFrom(signals: OnboardingSignals): OnboardingWizardState {
  return {
    provider: signals.providers.length > 0,
    models: signals.providers.some((provider) => provider.models.length > 0),
    agents: signals.agentCount > 0,
  };
}

export function remainingWizardSteps(state: OnboardingWizardState): OnboardingWizardStepId[] {
  return WIZARD_STEP_ORDER.filter((step) => !state[step]);
}

export function nextWizardStep(
  state: OnboardingWizardState,
  after?: OnboardingWizardStepId,
): OnboardingWizardStepId | null {
  const remaining = remainingWizardSteps(state);
  if (!after) {
    return remaining[0] ?? null;
  }
  const afterIndex = WIZARD_STEP_ORDER.indexOf(after);
  return remaining.find((step) => WIZARD_STEP_ORDER.indexOf(step) > afterIndex) ?? null;
}

export function checklistFrom(signals: OnboardingSignals): OnboardingChecklist {
  const doneSignals: Record<OnboardingChecklistKey, boolean> = {
    provider: signals.providers.length > 0,
    models: signals.providers.some((provider) => provider.models.length > 0),
    agents: signals.agentCount > 0,
    dashboard: signals.dashboardCount > 0,
    board: signals.boards.length > 0,
    issue: signals.issues.length > 0,
    issueDone: signals.issues.some((issue) => issueIsFinished(issue, signals.boards)),
  };
  const items = ONBOARDING_CHECKLIST_ORDER.map((key) => ({ key, done: doneSignals[key] }));
  const done = items.filter((item) => item.done).length;
  return { items, done, total: items.length, complete: done === items.length };
}

function issueIsFinished(issue: IssueRecord, boards: readonly IssueBoardRecord[]): boolean {
  const board = boards.find((candidate) => candidate.id === issue.boardId);
  const status = board?.statuses.find((candidate) => candidate.key === issue.statusKey);
  return status?.category === 'finished';
}
