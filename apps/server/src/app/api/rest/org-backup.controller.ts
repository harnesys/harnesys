import { Controller, Ctx, Get, HttpCode, Param, Post, ValidationException } from '@harnesys/brix';
import type { MachineOrgEntry } from '@harnesys/contracts';
import type { Context } from 'hono';
import { ExportOrgBackupUseCase } from '../../application/org-machine/export-org-backup.use-case.ts';
import { ImportOrgBackupUseCase } from '../../application/org-machine/import-org-backup.use-case.ts';
import type { UserPrincipal } from '../../domain/identity/principal.ts';
import { SessionPrincipal } from '../guards/session.guard.ts';

@Controller('orgs')
export class OrgBackupController {
  constructor(
    private readonly exportBackup: ExportOrgBackupUseCase,
    private readonly importBackup: ImportOrgBackupUseCase,
  ) {}

  @Get(':orgId/backup')
  async download(@Param('orgId') orgId: string): Promise<Response> {
    const { archivePath, fileName } = await this.exportBackup.execute({ orgId });
    const file = Bun.file(archivePath);
    return new Response(file, {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  }

  @Post('restore')
  @HttpCode(201)
  async restore(
    @Ctx() ctx: Context,
    @SessionPrincipal() principal: UserPrincipal,
  ): Promise<MachineOrgEntry> {
    const body = await ctx.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      throw new ValidationException('Backup archive file is required');
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    return this.importBackup.execute({ bytes, userId: principal.userId });
  }
}
