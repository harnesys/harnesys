import { Injectable } from '@harnesys/brix';
import type { SetDefaultExecutionProfileBody } from '@harnesys/contracts';
import { ExecutionProfileNotFoundException } from '../../domain/execution-profile/execution-profile.error.ts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';

export interface SetDefaultExecutionProfileRequest {
  orgId: string;
  body: SetDefaultExecutionProfileBody;
}

@Injectable()
export class SetDefaultExecutionProfileUseCase {
  constructor(private readonly profiles: ExecutionProfilePort) {}

  execute(request: SetDefaultExecutionProfileRequest): void {
    const existing = this.profiles.findById(request.orgId, request.body.profileId);
    if (!existing) {
      throw new ExecutionProfileNotFoundException(request.body.profileId);
    }
    this.profiles.setDefault(request.orgId, request.body.profileId);
  }
}
