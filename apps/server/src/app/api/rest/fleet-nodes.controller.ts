import { Controller, Delete, HttpCode, Param, Post } from '@harnesys/brix';
import type { RotateNodeTokenResponse } from '@harnesys/contracts';
import { DisconnectFleetNodeUseCase } from '../../application/fleet/disconnect-fleet-node.use-case.ts';
import { RemoveFleetNodeUseCase } from '../../application/fleet/remove-fleet-node.use-case.ts';
import { RotateNodeTokenUseCase } from '../../application/fleet/rotate-node-token.use-case.ts';
import { type Principal } from '../../domain/identity/principal.ts';
import { SessionPrincipal } from '../guards/session.guard.ts';
import { OrgIdHeader } from '../org-id.ts';

@Controller('fleet/nodes')
export class FleetNodesController {
  constructor(
    private readonly disconnectNode: DisconnectFleetNodeUseCase,
    private readonly removeNode: RemoveFleetNodeUseCase,
    private readonly rotateNode: RotateNodeTokenUseCase,
  ) {}

  @Post(':nodeId/disconnect')
  @HttpCode(204)
  disconnect(@OrgIdHeader() orgId: string, @Param('nodeId') nodeId: string): void {
    this.disconnectNode.execute({ orgId, nodeId });
  }

  @Post(':nodeId/rotate')
  rotate(
    @OrgIdHeader() orgId: string,
    @Param('nodeId') nodeId: string,
    @SessionPrincipal() principal: Principal,
  ): RotateNodeTokenResponse {
    return this.rotateNode.execute({ principal, orgId, nodeId });
  }

  @Delete(':nodeId')
  @HttpCode(204)
  async remove(
    @OrgIdHeader() orgId: string,
    @Param('nodeId') nodeId: string,
    @SessionPrincipal() principal: Principal,
  ): Promise<void> {
    await this.removeNode.execute({ principal, orgId, nodeId });
  }
}
