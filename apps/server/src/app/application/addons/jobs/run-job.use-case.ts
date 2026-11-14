import { Inject, Injectable, Logger } from '@harnesys/brix';
import { AddonJobScheduler } from './schedule-jobs.service.ts';

export interface RunJobRequest {
  orgId: string;
  addonId: string;
  jobId: string;
}

export interface RunJobResult {
  status: string | null;
}

@Injectable()
export class RunJobUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly scheduler: AddonJobScheduler,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addons-run-job');
  }

  async execute(request: RunJobRequest): Promise<RunJobResult> {
    const status = await this.scheduler.runNow(request.orgId, request.addonId, request.jobId);
    this.logger.info(
      { orgId: request.orgId, addonId: request.addonId, jobId: request.jobId, status },
      'job ran on demand',
    );
    return { status };
  }
}
