import { Injectable } from '@harnesys/brix';
import type { CreateExecutionProfileBody, ExecutionProfile } from '@harnesys/contracts';
import { ExecutionProfileValidationException } from '../../domain/execution-profile/execution-profile.error.ts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';

export interface CreateExecutionProfileRequest {
  orgId: string;
  body: CreateExecutionProfileBody;
}

@Injectable()
export class CreateExecutionProfileUseCase {
  constructor(private readonly profiles: ExecutionProfilePort) {}

  execute(request: CreateExecutionProfileRequest): ExecutionProfile {
    const name = request.body.name.trim();
    if (!name) {
      throw new ExecutionProfileValidationException('profile name cannot be empty');
    }
    return this.profiles.insert(request.orgId, { name });
  }
}
