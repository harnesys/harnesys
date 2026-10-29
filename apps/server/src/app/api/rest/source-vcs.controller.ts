import { Body, Controller, Param, Patch, Post } from '@harnesys/brix';
import {
  type InitGitBody,
  InitGitBodySchema,
  type SetGitRemoteBody,
  SetGitRemoteBodySchema,
  type SetSourceAvailabilityBody,
  SetSourceAvailabilityBodySchema,
  type Source,
  type SourceVcs,
} from '@harnesys/contracts';
import { InitGitUseCase } from '../../application/source/init-git.use-case.ts';
import { RefreshSourceVcsUseCase } from '../../application/source/refresh-source-vcs.use-case.ts';
import { SetGitRemoteUseCase } from '../../application/source/set-git-remote.use-case.ts';
import { SetSourceAvailabilityUseCase } from '../../application/source/set-source-availability.use-case.ts';

@Controller('orgs/:orgId/sources')
export class SourceVcsController {
  constructor(
    private readonly initGit: InitGitUseCase,
    private readonly gitRemote: SetGitRemoteUseCase,
    private readonly sourceAvailability: SetSourceAvailabilityUseCase,
    private readonly refreshSourceVcs: RefreshSourceVcsUseCase,
  ) {}

  @Post(':sourceId/git/init')
  init(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(InitGitBodySchema) body: InitGitBody,
  ): Promise<{ ok: true }> {
    return this.initGit.execute({ orgId, sourceId, hostId: body.hostId });
  }

  @Post(':sourceId/git-remote')
  setGitRemote(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(SetGitRemoteBodySchema) body: SetGitRemoteBody,
  ): Promise<Source> {
    return this.gitRemote.execute({
      orgId,
      sourceId,
      hostId: body.hostId,
      url: body.url,
      credRef: body.credRef,
    });
  }

  @Patch(':sourceId/availability')
  setAvailability(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(SetSourceAvailabilityBodySchema) body: SetSourceAvailabilityBody,
  ): Source {
    return this.sourceAvailability.execute({ orgId, sourceId, hostIds: body.hostIds });
  }

  @Post(':sourceId/refresh-vcs')
  refreshVcs(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
  ): Promise<{ vcs: SourceVcs | null }> {
    return this.refreshSourceVcs.execute({ orgId, sourceId });
  }
}
