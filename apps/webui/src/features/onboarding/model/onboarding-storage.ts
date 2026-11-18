const ONBOARDING_STORAGE_KEY = 'harnesys.onboarding.v1';

export interface OnboardingStoredState {
  starterBoardId: string | null;
  starterBoardSeededAt: string | null;
  starterRuleSeededAt: string | null;
  checklistDismissedAt: string | null;
}

const EMPTY_ONBOARDING_STATE: OnboardingStoredState = {
  starterBoardId: null,
  starterBoardSeededAt: null,
  starterRuleSeededAt: null,
  checklistDismissedAt: null,
};

export function loadOnboardingState(): OnboardingStoredState {
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (raw === null) {
      return { ...EMPTY_ONBOARDING_STATE };
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ...EMPTY_ONBOARDING_STATE };
    }
    const record = parsed as Record<string, unknown>;
    return {
      starterBoardId: readString(record.starterBoardId),
      starterBoardSeededAt: readString(record.starterBoardSeededAt),
      starterRuleSeededAt: readString(record.starterRuleSeededAt),
      checklistDismissedAt: readString(record.checklistDismissedAt),
    };
  } catch {
    return { ...EMPTY_ONBOARDING_STATE };
  }
}

export function patchOnboardingState(patch: Partial<OnboardingStoredState>): OnboardingStoredState {
  const next = { ...loadOnboardingState(), ...patch };
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
