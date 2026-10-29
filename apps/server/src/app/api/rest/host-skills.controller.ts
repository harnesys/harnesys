import { type BrixContext, Controller, Ctx, HttpCode, Param, Post } from '@harnesys/brix';
import {
  NodeTicketAccess,
  ticketCredentialOf,
} from '../../application/identity/node-ticket-access.ts';
import type { RestoreSystemSkillResponse } from '../../application/skills/restore-system-skill.use-case.ts';
import { RestoreSystemSkillUseCase } from '../../application/skills/restore-system-skill.use-case.ts';

@Controller('host/system-skills')
export class HostSkillsController {
  constructor(
    private readonly restoreSkill: RestoreSystemSkillUseCase,
    private readonly tickets: NodeTicketAccess,
  ) {}

  @Post(':name/restore')
  @HttpCode(200)
  async restore(
    @Param('name') name: string,
    @Ctx() ctx: BrixContext,
  ): Promise<RestoreSystemSkillResponse> {
    const ticket = ticketCredentialOf(ctx.req.raw);
    if (ticket) {
      const verified = await this.tickets.verify({
        ticket,
        orgId: null,
        requiredActions: ['source.write'],
      });
      this.tickets.consume(verified);
    }
    return this.restoreSkill.execute({ name });
  }
}
