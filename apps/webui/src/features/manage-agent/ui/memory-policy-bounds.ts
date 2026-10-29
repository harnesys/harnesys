const POLICY_NUMBER_BOUNDS = {
  projectLimit: { min: 1, max: 100 },
  projectBudgetTokens: { min: 100, max: 8000 },
  pinBudgetTokens: { min: 100, max: 8000 },
  relevanceTopK: { min: 1, max: 50 },
  relevanceMinChars: { min: 0, max: 1000 },
  factClipChars: { min: 40, max: 2000 },
  minSteps: { min: 0, max: 1000 },
  maxNudges: { min: 0, max: 10 },
  reflectInterval: { min: 1, max: 720 },
  decayHalfLifeDays: { min: 1, max: 3650 },
  promoteThreshold: { min: 0, max: 10 },
} as const;

export type PolicyNumberKey = keyof typeof POLICY_NUMBER_BOUNDS;

export function clampPolicyNumber(key: PolicyNumberKey, value: number): number {
  const bounds = POLICY_NUMBER_BOUNDS[key];
  return Math.min(bounds.max, Math.max(bounds.min, value));
}
