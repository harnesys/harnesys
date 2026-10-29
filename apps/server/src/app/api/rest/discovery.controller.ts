import { Body, Controller, HttpCode, Post, Public } from '@harnesys/brix';
import {
  type PairBody,
  PairBodySchema,
  type PairResponse,
  type PromoteAcceptBody,
  PromoteAcceptBodySchema,
  type PromoteAcceptResponse,
  type RetargetBody,
  RetargetBodySchema,
} from '@harnesys/contracts';
import { PairWithRelayUseCase } from '../../application/fleet/pair-with-relay.use-case.ts';
import { RetargetUseCase } from '../../application/fleet/retarget.use-case.ts';
import { PromoteRelayUseCase } from '../../application/host/promote-relay.use-case.ts';

@Controller('discovery')
export class DiscoveryController {
  constructor(
    private readonly pairWithRelay: PairWithRelayUseCase,
    private readonly retarget: RetargetUseCase,
    private readonly promote: PromoteRelayUseCase,
  ) {}

  @Public()
  @Post('pair')
  @HttpCode(201)
  pair(@Body(PairBodySchema) body: PairBody): Promise<PairResponse> {
    return this.pairWithRelay.execute(body);
  }

  @Post('retarget')
  retargetOrg(@Body(RetargetBodySchema) body: RetargetBody): { ok: true; relayUrl: string } {
    return this.retarget.execute(body);
  }

  @Post('promote/accept')
  acceptPromote(
    @Body(PromoteAcceptBodySchema) body: PromoteAcceptBody,
  ): Promise<PromoteAcceptResponse> {
    return this.promote.accept(body);
  }
}
