export type RunDispatchOutcome = 'fired' | 'suppressed' | 'busy' | 'failed';

/** Outcome of a trigger fire; `script-only` means the fire completed without an agent run. */
export type TriggerFireOutcomeCode = RunDispatchOutcome | 'script-only';
