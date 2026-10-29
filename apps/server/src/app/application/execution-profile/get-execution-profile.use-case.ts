import { Injectable } from '@harnesys/brix';
import type { ExecutionProfileDetail, ExecutionProfileNodeItem } from '@harnesys/contracts';
import { ExecutionProfileNotFoundException } from '../../domain/execution-profile/execution-profile.error.ts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import { FleetHubPort, type FleetPresenceNode } from '../../domain/fleet/fleet-hub.port.ts';

export interface GetExecutionProfileRequest {
  orgId: string;
  profileId: string;
}

@Injectable()
export class GetExecutionProfileUseCase {
  constructor(
    private readonly profiles: ExecutionProfilePort,
    private readonly hub: FleetHubPort,
  ) {}

  execute(request: GetExecutionProfileRequest): ExecutionProfileDetail {
    const profile = this.profiles.findById(request.orgId, request.profileId);
    if (!profile) {
      throw new ExecutionProfileNotFoundException(request.profileId);
    }
    const defaultProfileId = this.profiles.getDefault(request.orgId) ?? null;
    const nodes = this.hub.listPresence(request.orgId);
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    return {
      id: profile.id,
      orgId: profile.orgId,
      name: profile.name,
      system: profile.system,
      nodeIds: profile.nodeIds,
      isolation: profile.isolation,
      dockerImage: profile.dockerImage,
      isDefault: profile.id === defaultProfileId,
      nodes: profile.nodeIds
        .map((nodeId) => toNodeItem(nodeMap.get(nodeId), nodeId))
        .filter((item): item is ExecutionProfileNodeItem => item !== null),
    };
  }
}

function toNodeItem(
  node: FleetPresenceNode | undefined,
  nodeId: string,
): ExecutionProfileNodeItem | null {
  if (!node) {
    return null;
  }
  return {
    nodeId,
    nodeName: node.name,
    status: node.status,
    role: node.role,
  };
}
