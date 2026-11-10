export interface SupervisorConfig {
  readonly hostVersion: string;
  readonly hostFeatures: readonly string[];
  readonly locale: string;
  readonly startupTimeoutMs: number;
  readonly pingIntervalMs: number;
  readonly pingTimeoutMs: number;
  readonly pingMissesToRestart: number;
  readonly idleTimeoutMs: number;
  readonly backoffInitialMs: number;
  readonly backoffMaxMs: number;
  readonly crashWindowMs: number;
  readonly crashThreshold: number;
  readonly rssLimitBytes: number;
  readonly shutdownDeadlineMs: number;
  readonly sigtermGraceMs: number;
  readonly inProcessEnabled: boolean;
}

export const MIB = 1024 * 1024;

export const DEFAULT_SUPERVISOR_CONFIG: SupervisorConfig = {
  hostVersion: '0.0.0',
  hostFeatures: [],
  locale: 'en',
  startupTimeoutMs: 15_000,
  pingIntervalMs: 15_000,
  pingTimeoutMs: 5_000,
  pingMissesToRestart: 3,
  idleTimeoutMs: 5 * 60_000,
  backoffInitialMs: 1_000,
  backoffMaxMs: 60_000,
  crashWindowMs: 10 * 60_000,
  crashThreshold: 5,
  rssLimitBytes: 512 * MIB,
  shutdownDeadlineMs: 5_000,
  sigtermGraceMs: 2_000,
  inProcessEnabled: true,
};

export class SupervisorSettings {
  readonly config: SupervisorConfig;

  constructor(config?: Partial<SupervisorConfig>) {
    this.config = { ...DEFAULT_SUPERVISOR_CONFIG, ...config };
  }
}
