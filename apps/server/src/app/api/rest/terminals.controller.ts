import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@harnesys/brix';
import type { TerminalSessionRecord } from '@harnesys/studio-shared';
import { z } from 'zod';
import { CreateTerminalSessionUseCase } from '../../application/terminal/create-terminal-session.use-case.ts';
import { DeleteTerminalSessionUseCase } from '../../application/terminal/delete-terminal-session.use-case.ts';
import { ListTerminalSessionsUseCase } from '../../application/terminal/list-terminal-sessions.use-case.ts';

const CreateTerminalBodySchema = z.object({
  cwd: z.string().min(1).optional(),
});
type CreateTerminalBody = z.infer<typeof CreateTerminalBodySchema>;

@Controller('orgs/:orgId/sources/:sourceId/terminals')
export class TerminalsController {
  constructor(
    private readonly listSessions: ListTerminalSessionsUseCase,
    private readonly createSession: CreateTerminalSessionUseCase,
    private readonly deleteSession: DeleteTerminalSessionUseCase,
  ) {}

  @Get()
  list(
    @Param('orgId') _orgId: string,
    @Param('sourceId') sourceId: string,
  ): TerminalSessionRecord[] {
    return this.listSessions.execute({ projectId: sourceId });
  }

  @Post()
  create(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(CreateTerminalBodySchema) body: CreateTerminalBody,
  ): TerminalSessionRecord {
    return this.createSession.execute({ orgId, projectId: sourceId, cwd: body.cwd });
  }

  @Delete(':sessionId')
  @HttpCode(204)
  delete(
    @Param('orgId') _orgId: string,
    @Param('sourceId') sourceId: string,
    @Param('sessionId') sessionId: string,
  ): void {
    this.deleteSession.execute({ projectId: sourceId, sessionId });
  }
}
