export interface WorkerLeaseClaim {
  orgId: string;
  addonId: string;
  workerId: string;
  holderId: string;
  ttlMs: number;
  nowMs: number;
}

export interface WorkerLeaseState {
  held: boolean;
  epoch: number;
  expiresAt: string | null;
}

export interface WorkerLeaseRelease {
  orgId: string;
  addonId: string;
  workerId: string;
  holderId: string;
}

export abstract class AddonWorkerLeasePort {
  abstract claim(input: WorkerLeaseClaim): WorkerLeaseState;

  abstract release(input: WorkerLeaseRelease): boolean;
}
