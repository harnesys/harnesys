import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@harnesys/brix';
import {
  type CreateOrgBody,
  CreateOrgBodySchema,
  type MachineOrgEntry,
  type OrgSettings,
  type OrgSettingsPatch,
  OrgSettingsPatchSchema,
  type OrgsListResponse,
  type UpdateOrgBody,
  UpdateOrgBodySchema,
} from '@harnesys/contracts';
import { GetActiveHostUseCase } from '../../application/fleet/get-active-host.use-case.ts';
import { ActivateOrgUseCase } from '../../application/org-machine/activate-org.use-case.ts';
import { CreateRelayOrgUseCase } from '../../application/org-machine/create-relay-org.use-case.ts';
import { DeleteOrgUseCase } from '../../application/org-machine/delete-org.use-case.ts';
import { GetOrgSettingsUseCase } from '../../application/org-machine/get-org-settings.use-case.ts';
import { ListOrgsUseCase } from '../../application/org-machine/list-orgs.use-case.ts';
import { SetOrgSettingsUseCase } from '../../application/org-machine/set-org-settings.use-case.ts';
import { UpdateOrgUseCase } from '../../application/org-machine/update-org.use-case.ts';
import { type UserPrincipal } from '../../domain/identity/principal.ts';
import { SessionPrincipal } from '../guards/session.guard.ts';

@Controller('orgs')
export class OrgsController {
  constructor(
    private readonly createRelayOrg: CreateRelayOrgUseCase,
    private readonly listOrgs: ListOrgsUseCase,
    private readonly activateOrg: ActivateOrgUseCase,
    private readonly updateOrg: UpdateOrgUseCase,
    private readonly deleteOrg: DeleteOrgUseCase,
    private readonly getOrgSettings: GetOrgSettingsUseCase,
    private readonly setOrgSettings: SetOrgSettingsUseCase,
    private readonly getActiveHost: GetActiveHostUseCase,
  ) {}

  @Get(':id/active-host')
  activeHost(
    @Param('id') id: string,
    @SessionPrincipal() principal: UserPrincipal,
  ): { hostId: string } {
    return this.getActiveHost.execute({ orgId: id, principal });
  }

  @Get()
  list(@SessionPrincipal() principal: UserPrincipal): OrgsListResponse {
    return this.listOrgs.execute({ userId: principal.userId });
  }

  @Post()
  @HttpCode(201)
  create(
    @Body(CreateOrgBodySchema) body: CreateOrgBody,
    @SessionPrincipal() principal: UserPrincipal,
  ): MachineOrgEntry {
    return this.createRelayOrg.execute({
      name: body.name,
      userId: principal.userId,
      ...(body.workspacePath !== undefined ? { workspacePath: body.workspacePath } : {}),
    });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(UpdateOrgBodySchema) body: UpdateOrgBody): MachineOrgEntry {
    return this.updateOrg.execute({
      orgId: id,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
    });
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): void {
    this.deleteOrg.execute({ orgId: id });
  }

  @Post(':id/activate')
  @HttpCode(204)
  activate(@Param('id') id: string): void {
    this.activateOrg.execute({ orgId: id });
  }

  @Get(':id/settings')
  settings(@Param('id') id: string): OrgSettings {
    return this.getOrgSettings.execute({ orgId: id });
  }

  @Patch(':id/settings')
  updateSettings(
    @Param('id') id: string,
    @Body(OrgSettingsPatchSchema) body: OrgSettingsPatch,
  ): OrgSettings {
    return this.setOrgSettings.execute({ orgId: id, patch: body });
  }
}
