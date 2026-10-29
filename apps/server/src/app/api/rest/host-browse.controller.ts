import {
  Body,
  type BrixContext,
  Controller,
  Ctx,
  ForbiddenException,
  Param,
  Post,
} from '@harnesys/brix';
import { z } from 'zod';
import {
  NodeTicketAccess,
  ticketCredentialOf,
} from '../../application/identity/node-ticket-access.ts';
import { BrowseHostDirsUseCase } from '../../application/source/browse-host-dirs.use-case.ts';
import type { CreateHostDirResult } from '../../application/source/create-host-dir.use-case.ts';
import { CreateHostDirUseCase } from '../../application/source/create-host-dir.use-case.ts';
import type { HostDirectoryListing } from '../../domain/content/host-directory.ts';

const BrowseHostDirsBodySchema = z.object({
  path: z.string().optional(),
  hostId: z.string().min(1).optional(),
});
type BrowseHostDirsBody = z.infer<typeof BrowseHostDirsBodySchema>;

const CreateHostDirBodySchema = z.object({
  path: z.string().min(1),
  hostId: z.string().min(1).optional(),
});
type CreateHostDirBody = z.infer<typeof CreateHostDirBodySchema>;

@Controller('orgs/:orgId')
export class HostBrowseController {
  constructor(
    private readonly browseHostDirs: BrowseHostDirsUseCase,
    private readonly createHostDir: CreateHostDirUseCase,
    private readonly tickets: NodeTicketAccess,
  ) {}

  @Post('browse-dirs')
  async browse(
    @Param('orgId') orgId: string,
    @Body(BrowseHostDirsBodySchema) body: BrowseHostDirsBody,
    @Ctx() ctx: BrixContext,
  ): Promise<HostDirectoryListing> {
    const ticket = ticketCredentialOf(ctx.req.raw);
    if (ticket) {
      const verified = await this.tickets.verify({
        ticket,
        orgId,
        requiredActions: ['source.read'],
      });
      this.tickets.consume(verified);
      if (body.hostId && body.hostId !== verified.claims.nodeId) {
        throw new ForbiddenException('ticket bound to the local host only');
      }
      return this.browseHostDirs.execute({
        orgId,
        hostId: verified.claims.nodeId,
        path: body.path,
      });
    }
    return this.browseHostDirs.execute({
      orgId,
      path: body.path,
      hostId: body.hostId,
    });
  }

  @Post('create-dir')
  async createDir(
    @Param('orgId') orgId: string,
    @Body(CreateHostDirBodySchema) body: CreateHostDirBody,
    @Ctx() ctx: BrixContext,
  ): Promise<CreateHostDirResult> {
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
      return this.createHostDir.execute({
        orgId,
        hostId: verified.claims.nodeId,
        path: body.path,
      });
    }
    return this.createHostDir.execute({
      orgId,
      path: body.path,
      hostId: body.hostId,
    });
  }
}
