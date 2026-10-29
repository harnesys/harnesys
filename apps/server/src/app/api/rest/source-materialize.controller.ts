import {
  Body,
  type BrixContext,
  Controller,
  Ctx,
  ForbiddenException,
  HttpCode,
  Param,
  Post,
} from '@harnesys/brix';
import {
  type AttachLocalFolderBody,
  AttachLocalFolderBodySchema,
  type PrepareGitSourceBody,
  PrepareGitSourceBodySchema,
  type PrepareGitSourceResponse,
  type Source,
} from '@harnesys/contracts';
import {
  NodeTicketAccess,
  ticketCredentialOf,
} from '../../application/identity/node-ticket-access.ts';
import { AttachLocalFolderUseCase } from '../../application/source/attach-local-folder.use-case.ts';
import { GetSourceUseCase } from '../../application/source/get-source.use-case.ts';
import { PrepareCloudSourceUseCase } from '../../application/source/prepare-cloud-source.use-case.ts';
import { PrepareGitSourceUseCase } from '../../application/source/prepare-git-source.use-case.ts';
import { BearerToken } from '../org-id.ts';
import { SurfaceHostIdHeader } from '../surface-host.ts';

@Controller('orgs/:orgId/sources')
export class SourceMaterializeController {
  constructor(
    private readonly attachLocalFolder: AttachLocalFolderUseCase,
    private readonly getSource: GetSourceUseCase,
    private readonly prepareGit: PrepareGitSourceUseCase,
    private readonly prepareCloud: PrepareCloudSourceUseCase,
    private readonly tickets: NodeTicketAccess,
  ) {}

  @Post()
  @HttpCode(201)
  async attach(
    @Param('orgId') orgId: string,
    @Body(AttachLocalFolderBodySchema) body: AttachLocalFolderBody,
    @BearerToken() callerBearerToken: string,
    @Ctx() ctx: BrixContext,
  ): Promise<Source> {
    const ticket = ticketCredentialOf(ctx.req.raw);
    if (ticket) {
      const verified = await this.tickets.verify({
        ticket,
        orgId,
        requiredActions: ['source.write'],
      });
      this.tickets.consume(verified);
      if (body.hostId && body.hostId !== verified.claims.nodeId) {
        throw new ForbiddenException('ticket bound to the local host only');
      }
      return this.attachLocalFolder.execute({
        orgId,
        absolutePath: body.absolutePath,
        name: body.name,
        hostId: verified.claims.nodeId,
        uiVisibility: body.uiVisibility,
      });
    }
    return this.attachLocalFolder.execute({
      orgId,
      absolutePath: body.absolutePath,
      name: body.name,
      hostId: body.hostId,
      uiVisibility: body.uiVisibility,
      callerBearerToken,
    });
  }

  @Post(':sourceId/prepare')
  async prepareSource(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(PrepareGitSourceBodySchema) body: PrepareGitSourceBody,
    @SurfaceHostIdHeader() surfaceHostId: string | null,
    @Ctx() ctx: BrixContext,
  ): Promise<PrepareGitSourceResponse> {
    const ticket = ticketCredentialOf(ctx.req.raw);
    if (ticket) {
      const verified = await this.tickets.verify({
        ticket,
        orgId,
        requiredActions: ['source.write'],
      });
      this.tickets.consume(verified);
      if (body.hostId !== verified.claims.nodeId) {
        throw new ForbiddenException('ticket bound to the local host only');
      }
      return this.prepareGit.execute({
        orgId,
        sourceId,
        hostId: verified.claims.nodeId,
      });
    }
    const source = this.getSource.execute({ orgId, sourceId, surfaceHostId });
    if (source.distribution.kind === 'cloud-drive') {
      return this.prepareCloud.execute({
        orgId,
        sourceId,
        hostId: body.hostId,
      });
    }
    return this.prepareGit.execute({
      orgId,
      sourceId,
      hostId: body.hostId,
    });
  }
}
