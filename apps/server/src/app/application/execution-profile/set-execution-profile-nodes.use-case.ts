import { Injectable } from '@harnesys/brix';
import type { ExecutionProfile, SetExecutionProfileNodesBody } from '@harnesys/contracts';
import {
  ExecutionProfileNotFoundException,
  ExecutionProfileSystemException,
} from '../../domain/execution-profile/execution-profile.error.ts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import { LOCAL_EXECUTION_PROFILE_ID } from '../../domain/execution-profile/execution-profile.ts';
import { FleetEventsPort } from '../../domain/fleet/fleet-events.port.ts';

export interface SetExecutionProfileNodesRequest {
  orgId: string;
  profileId: string;
  body: SetExecutionProfileNodesBody;
}

@Injectable()
export class SetExecutionProfileNodesUseCase {
  constructor(
    private readonly profiles: ExecutionProfilePort,
    private readonly fleetEvents: FleetEventsPort,
  ) {}

  execute(request: SetExecutionProfileNodesRequest): ExecutionProfile {
    const existing = this.profiles.findById(request.orgId, request.profileId);
    if (!existing) {
      throw new ExecutionProfileNotFoundException(request.profileId);
    }
    if (existing.system && request.profileId === LOCAL_EXECUTION_PROFILE_ID) {
      const defaultProfileId = this.profiles.getDefault(request.orgId);
      if (defaultProfileId === LOCAL_EXECUTION_PROFILE_ID && request.body.nodeIds.length === 0) {
        throw new ExecutionProfileSystemException(
          'local profile cannot be emptied while it is the organization default',
        );
      }
    }
    const updated = this.profiles.setNodes(request.orgId, request.profileId, request.body.nodeIds);
    this.fleetEvents.emit(request.orgId);
    return updated;
  }
}
