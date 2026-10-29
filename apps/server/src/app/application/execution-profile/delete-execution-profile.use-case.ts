import { Injectable } from '@harnesys/brix';
import {
  ExecutionProfileInUseException,
  ExecutionProfileNotFoundException,
  ExecutionProfileSystemException,
} from '../../domain/execution-profile/execution-profile.error.ts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';

export interface DeleteExecutionProfileRequest {
  orgId: string;
  profileId: string;
}

@Injectable()
export class DeleteExecutionProfileUseCase {
  constructor(private readonly profiles: ExecutionProfilePort) {}

  execute(request: DeleteExecutionProfileRequest): void {
    const existing = this.profiles.findById(request.orgId, request.profileId);
    if (!existing) {
      throw new ExecutionProfileNotFoundException(request.profileId);
    }
    if (existing.system) {
      throw new ExecutionProfileSystemException('cannot delete system profile');
    }
    const usage = this.profiles.countUsage(request.orgId, request.profileId);
    if (usage.orgDefault || usage.agents > 0 || usage.boardRules > 0) {
      throw new ExecutionProfileInUseException(request.profileId, usage);
    }
    this.profiles.delete(request.orgId, request.profileId);
  }
}
