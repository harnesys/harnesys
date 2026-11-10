import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@harnesys/brix';
import type { OrgAddonDetail, OrgAddonListResponse } from '@harnesys/contracts';
import {
  AddonGrantBodySchema,
  AddonRollbackBodySchema,
  AddonUpdateBodySchema,
} from '@harnesys/contracts';
import type { FieldValue } from '@harnesys/sdk';
import { z } from 'zod';
import { DisableAddonUseCase } from '../../application/addons/orgs/disable.use-case.ts';
import { EnableAddonUseCase } from '../../application/addons/orgs/enable.use-case.ts';
import { RollbackAddonUseCase } from '../../application/addons/orgs/rollback.use-case.ts';
import { SetBindingsUseCase } from '../../application/addons/orgs/set-bindings.use-case.ts';
import { SetConfigUseCase } from '../../application/addons/orgs/set-config.use-case.ts';
import { SetGrantsUseCase } from '../../application/addons/orgs/set-grants.use-case.ts';
import { UninstallAddonUseCase } from '../../application/addons/orgs/uninstall.use-case.ts';
import { UpdateAddonUseCase } from '../../application/addons/orgs/update.use-case.ts';
import { AddonException } from '../../domain/addons/errors.ts';
import { AddonPackageCatalogPort } from '../../domain/addons/ports/addon-package-catalog.port.ts';
import { AddonConfigReadPort } from '../../domain/addons/ports/addon-read-models.port.ts';
import { BindingRepositoryPort } from '../../domain/addons/ports/binding-repository.port.ts';
import { InstanceSupervisorPort } from '../../domain/addons/ports/instance-supervisor.port.ts';
import { OrgAddonRepositoryPort } from '../../domain/addons/ports/org-addon-repository.port.ts';
import { PermissionDefinitionsPort } from '../../domain/addons/ports/permission-definitions.port.ts';
import { AddonOrgAdminGuard } from '../guards/addon-org-admin.guard.ts';
import { OrgAccessGuard } from '../guards/org-access.guard.ts';
import {
  latestVersionOf,
  orgAddonDetailOf,
  orgAddonSummaryOf,
  orgAvailableDetailOf,
} from './addons-org-views.ts';

const EnableBodySchema = AddonGrantBodySchema;
const GrantsBodySchema = z.object({ grants: AddonGrantBodySchema.shape.grants });
const UninstallQuerySchema = z.object({ data: z.enum(['keep', 'purge']).default('keep') });
const ConfigBodySchema = z.object({
  values: z.record(z.string(), z.unknown()),
  secrets: z.record(z.string(), z.string().nullable()).optional(),
});
const BindingsBodySchema = z.object({ accountIds: z.array(z.string().min(1)) });

@UseGuards(OrgAccessGuard)
@Controller('orgs/:orgId/addons')
export class AddonsOrgController {
  constructor(
    private readonly enableAddon: EnableAddonUseCase,
    private readonly disableAddon: DisableAddonUseCase,
    private readonly updateAddon: UpdateAddonUseCase,
    private readonly rollbackAddon: RollbackAddonUseCase,
    private readonly uninstallAddon: UninstallAddonUseCase,
    private readonly saveGrants: SetGrantsUseCase,
    private readonly saveConfig: SetConfigUseCase,
    private readonly saveBindings: SetBindingsUseCase,
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly catalog: AddonPackageCatalogPort,
    private readonly accountBindings: BindingRepositoryPort,
    private readonly supervisor: InstanceSupervisorPort,
    private readonly configReadModel: AddonConfigReadPort,
    private readonly definitions: PermissionDefinitionsPort,
  ) {}

  @Get()
  list(@Param('orgId') orgId: string): OrgAddonListResponse {
    const items = this.orgAddons
      .list(orgId)
      .map((row) =>
        orgAddonSummaryOf(
          { definitions: this.definitions },
          row,
          this.catalog.find(row.addonId, row.version),
          latestVersionOf(this.catalog, row.addonId),
        ),
      );
    return { items };
  }

  @Get(':id')
  detail(@Param('orgId') orgId: string, @Param('id') id: string): OrgAddonDetail {
    const row = this.orgAddons.find(orgId, id);
    if (row) {
      return orgAddonDetailOf({
        deps: { definitions: this.definitions },
        row,
        pkg: this.catalog.find(id, row.version),
        latest: this.catalog.find(id),
        bindings: this.accountBindings.list(orgId, id),
        configValues: this.configReadModel.values(orgId, id),
      });
    }
    const available = this.catalog.find(id);
    if (!available) {
      throw new AddonException(
        'not_found',
        404,
        `Addon is not installed in this organization: ${id}`,
      );
    }
    return orgAvailableDetailOf({
      deps: { definitions: this.definitions },
      orgId,
      pkg: available,
    });
  }

  @UseGuards(AddonOrgAdminGuard)
  @Post(':id/enable')
  async enable(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body(EnableBodySchema) body: z.infer<typeof EnableBodySchema>,
  ) {
    return await this.enableAddon.execute({
      orgId,
      addonId: id,
      ...(body.version === undefined ? {} : { version: body.version }),
      grants: body.grants,
      actor: { kind: 'user', id: 'admin' },
    });
  }

  @UseGuards(AddonOrgAdminGuard)
  @Post(':id/disable')
  async disable(@Param('orgId') orgId: string, @Param('id') id: string): Promise<void> {
    await this.disableAddon.execute({ orgId, addonId: id, actor: { kind: 'user', id: 'admin' } });
  }

  @UseGuards(AddonOrgAdminGuard)
  @Post(':id/update')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body(AddonUpdateBodySchema) body: z.infer<typeof AddonUpdateBodySchema>,
  ) {
    return await this.updateAddon.execute({
      orgId,
      addonId: id,
      version: body.version,
      ...(body.grants === undefined ? {} : { grants: body.grants }),
      actor: { kind: 'user', id: 'admin' },
    });
  }

  @UseGuards(AddonOrgAdminGuard)
  @Post(':id/rollback')
  async rollback(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body(AddonRollbackBodySchema) body: z.infer<typeof AddonRollbackBodySchema>,
  ) {
    return await this.rollbackAddon.execute({
      orgId,
      addonId: id,
      version: body.version,
      actor: { kind: 'user', id: 'admin' },
    });
  }

  @UseGuards(AddonOrgAdminGuard)
  @Put(':id/grants')
  async grants(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body(GrantsBodySchema) body: z.infer<typeof GrantsBodySchema>,
  ) {
    return await this.saveGrants.execute({
      orgId,
      addonId: id,
      grants: body.grants,
      actor: { kind: 'user', id: 'admin' },
    });
  }

  @UseGuards(AddonOrgAdminGuard)
  @Delete(':id')
  async uninstall(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Query(UninstallQuerySchema) query: z.infer<typeof UninstallQuerySchema>,
  ): Promise<void> {
    await this.uninstallAddon.execute({
      orgId,
      addonId: id,
      purgeData: query.data === 'purge',
      actor: { kind: 'user', id: 'admin' },
    });
  }

  @UseGuards(AddonOrgAdminGuard)
  @Put(':id/config')
  async config(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body(ConfigBodySchema) body: z.infer<typeof ConfigBodySchema>,
  ) {
    return await this.saveConfig.execute({
      orgId,
      addonId: id,
      values: body.values as Record<string, FieldValue>,
      ...(body.secrets === undefined ? {} : { secrets: body.secrets }),
      actor: { kind: 'user', id: 'admin' },
    });
  }

  @UseGuards(AddonOrgAdminGuard)
  @Put(':id/bindings/:connectionId')
  async bindings(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Param('connectionId') connectionId: string,
    @Body(BindingsBodySchema) body: z.infer<typeof BindingsBodySchema>,
  ) {
    return await this.saveBindings.execute({
      orgId,
      addonId: id,
      connectionId,
      accountIds: body.accountIds,
      actor: { kind: 'user', id: 'admin' },
    });
  }

  @UseGuards(AddonOrgAdminGuard)
  @Post(':id/restart')
  async restart(@Param('orgId') orgId: string, @Param('id') id: string) {
    return await this.supervisor.restart(orgId, id, 'manual');
  }

  @UseGuards(AddonOrgAdminGuard)
  @Post(':id/quarantine/reset')
  async quarantineReset(@Param('orgId') orgId: string, @Param('id') id: string) {
    return await this.supervisor.restart(orgId, id, 'quarantine_reset');
  }
}
