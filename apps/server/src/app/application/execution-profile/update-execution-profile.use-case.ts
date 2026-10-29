import { Injectable } from '@harnesys/brix';
import type { ExecutionProfile, UpdateExecutionProfileBody } from '@harnesys/contracts';
import { ExecutionProfileValidationException } from '../../domain/execution-profile/execution-profile.error.ts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import type { UpdateExecutionProfileInput } from '../../domain/execution-profile/execution-profile.ts';

export interface UpdateExecutionProfileRequest {
  orgId: string;
  profileId: string;
  body: UpdateExecutionProfileBody;
}

@Injectable()
export class UpdateExecutionProfileUseCase {
  constructor(private readonly profiles: ExecutionProfilePort) {}

  execute(request: UpdateExecutionProfileRequest): ExecutionProfile {
    const name = request.body.name?.trim();
    if (name === '') {
      throw new ExecutionProfileValidationException('profile name cannot be empty');
    }
    const input: UpdateExecutionProfileInput = {};
    if (name !== undefined) {
      input.name = name;
    }
    if (request.body.isolation !== undefined) {
      input.isolation = request.body.isolation;
      input.dockerImage =
        request.body.isolation === 'container' ? (request.body.dockerImage ?? null) : null;
    }
    return this.profiles.update(request.orgId, request.profileId, input);
  }
}
