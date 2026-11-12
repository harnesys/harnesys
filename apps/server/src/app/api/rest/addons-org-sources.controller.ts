import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@harnesys/brix';
import type { Source } from '@harnesys/contracts';
import { z } from 'zod';
import { AttachAddonCloudSourceUseCase } from '../../application/addons/sources/attach-addon-cloud-source.use-case.ts';
import { BrowseAddonCloudFolderUseCase } from '../../application/addons/sources/browse-addon-cloud-folder.use-case.ts';
import { ListAddonCloudSourcesUseCase } from '../../application/addons/sources/list-addon-cloud-sources.use-case.ts';
import { RefreshAddonCloudSourceUseCase } from '../../application/addons/sources/refresh-addon-cloud-source.use-case.ts';
import { DetachSourceUseCase } from '../../application/source/detach-source.use-case.ts';
import { AddonException } from '../../domain/addons/errors.ts';
import { AddonSourceKindsPort } from '../../domain/addons/ports/addon-source-kinds.port.ts';
import { BindingRepositoryPort } from '../../domain/addons/ports/binding-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../domain/addons/ports/org-addon-repository.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgAccessGuard } from '../guards/org-access.guard.ts';
import { SurfaceHostIdHeader } from '../surface-host.ts';

const BrowseBodySchema = z.object({
  folderId: z.string().optional(),
  accountId: z.string().min(1).optional(),
});

const AttachBodySchema = z.object({
  folderId: z.string().min(1),
  name: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
});

interface AddonSourceKindResponse {
  id: string;
  title: string;
  connection?: string;
  accountIds: string[];
  attached: number;
  supportsRootMount?: boolean;
  supportsSearch?: boolean;
  rootTitle?: string;
}

@UseGuards(OrgAccessGuard)
@Controller('orgs/:orgId/addons/:addonId')
export class AddonsOrgSourcesController {
  constructor(
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly kinds: AddonSourceKindsPort,
    private readonly accountBindings: BindingRepositoryPort,
    private readonly browseFolder: BrowseAddonCloudFolderUseCase,
    private readonly attachSource: AttachAddonCloudSourceUseCase,
    private readonly listSources: ListAddonCloudSourcesUseCase,
    private readonly refreshSource: RefreshAddonCloudSourceUseCase,
    private readonly detachSource: DetachSourceUseCase,
    private readonly machine: MachineConfigPort,
  ) {}

  @Get('source-kinds')
  sourceKinds(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
  ): { kinds: AddonSourceKindResponse[] } {
    const attached = this.listSources.execute({ orgId, addonId });
    const kinds = this.kinds
      .list(orgId)
      .filter((kind) => kind.addonId === addonId)
      .map((kind) => ({
        id: kind.id,
        title: kind.title,
        ...(kind.connection === undefined ? {} : { connection: kind.connection }),
        accountIds:
          kind.connection === undefined
            ? []
            : this.accountBindings
                .accountsFor(orgId, addonId, kind.connection)
                .map((row) => row.accountId),
        attached: attached.filter(
          (source) =>
            source.distribution.kind === 'addon-cloud' &&
            source.distribution.sourceKindId === kind.id,
        ).length,
        ...(kind.supportsRootMount === undefined
          ? {}
          : { supportsRootMount: kind.supportsRootMount }),
        ...(kind.supportsSearch === undefined ? {} : { supportsSearch: kind.supportsSearch }),
        ...(kind.rootTitle === undefined ? {} : { rootTitle: kind.rootTitle }),
      }));
    return { kinds };
  }

  @Post('source-kinds/:sourceKindId/browse')
  async browse(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
    @Param('sourceKindId') sourceKindId: string,
    @Body(BrowseBodySchema) body: z.infer<typeof BrowseBodySchema>,
  ): Promise<{ entries: unknown[] }> {
    const entries = await this.browseFolder.execute({
      orgId,
      addonId,
      sourceKindId,
      folderId: body.folderId,
      accountId: body.accountId,
    });
    return { entries };
  }

  @Post('source-kinds/:sourceKindId/attach')
  attach(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
    @Param('sourceKindId') sourceKindId: string,
    @Body(AttachBodySchema) body: z.infer<typeof AttachBodySchema>,
  ): Promise<Source> {
    return this.attachSource.execute({
      orgId,
      addonId,
      sourceKindId,
      folderId: body.folderId,
      name: body.name,
      accountId: body.accountId,
    });
  }

  @Get('sources')
  sources(@Param('orgId') orgId: string, @Param('addonId') addonId: string): { sources: Source[] } {
    return { sources: this.listSources.execute({ orgId, addonId }) };
  }

  @Delete('sources/:sourceId')
  @HttpCode(204)
  detach(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
    @Param('sourceId') sourceId: string,
  ): void {
    const owned = this.listSources
      .execute({ orgId, addonId })
      .some((source) => source.id === sourceId);
    if (!owned) {
      throw new AddonException(
        'not_found',
        404,
        `source ${sourceId} is not attached to ${addonId}`,
      );
    }
    this.detachSource.execute({ orgId, sourceId });
  }

  @Post('sources/:sourceId/refresh')
  refresh(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
    @Param('sourceId') sourceId: string,
    @SurfaceHostIdHeader() surfaceHostId: string | null,
  ): Promise<{ source: Source; skippedGoogleApps: number; state: string; conflicts: string[] }> {
    const record = this.orgAddons.find(orgId, addonId);
    if (!record) {
      throw new AddonException('not_found', 404, `add-on ${addonId} is not enabled`);
    }
    return this.refreshSource.execute({
      orgId,
      sourceId,
      hostId: surfaceHostId ?? this.machine.get().id,
    });
  }
}
