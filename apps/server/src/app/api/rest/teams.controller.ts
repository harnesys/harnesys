import { Body, Controller, HttpCode, Param, Post } from '@harnesys/brix';
import type { CreateTeamBody, CreateTeamResponse } from '@harnesys/contracts';
import { CreateTeamBodySchema } from '@harnesys/contracts';
import { CreateTeamFromPresetUseCase } from '../../application/teams/create-team-from-preset.use-case.ts';
import { principalUserId } from '../../application/threads/run-attribution.ts';
import type { Principal } from '../../domain/identity/principal.ts';
import { SessionPrincipal } from '../guards/session.guard.ts';

@Controller('orgs/:orgId/teams')
export class TeamsController {
  constructor(private readonly createTeam: CreateTeamFromPresetUseCase) {}

  @Post()
  @HttpCode(201)
  create(
    @Param('orgId') orgId: string,
    @SessionPrincipal() principal: Principal,
    @Body(CreateTeamBodySchema) body: CreateTeamBody,
  ): CreateTeamResponse {
    return this.createTeam.execute({
      orgId,
      actorUserId: principalUserId(principal),
      body,
    });
  }
}
