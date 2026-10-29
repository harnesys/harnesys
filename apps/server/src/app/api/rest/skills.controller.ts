import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@harnesys/brix';
import type {
  CreateOrgSkillBody,
  CreateOrgSkillResponse,
  DiscoverSkillsBody,
  DiscoverSkillsResponse,
  EffectiveSkillsQuery,
  InstallSkillsBody,
  InstallSkillsResponse,
  ListEffectiveSkillsResponse,
  ListOrgSkillsResponse,
} from '@harnesys/contracts';
import {
  CreateOrgSkillBodySchema,
  DiscoverSkillsBodySchema,
  EffectiveSkillsQuerySchema,
  InstallSkillsBodySchema,
} from '@harnesys/contracts';
import { CreateOrgSkillUseCase } from '../../application/skills/create-org-skill.use-case.ts';
import { DeleteOrgSkillUseCase } from '../../application/skills/delete-org-skill.use-case.ts';
import { DiscoverRepoSkillsUseCase } from '../../application/skills/discover-repo-skills.use-case.ts';
import { GetEffectiveSkillsUseCase } from '../../application/skills/get-effective-skills.use-case.ts';
import { InstallRepoSkillsUseCase } from '../../application/skills/install-repo-skills.use-case.ts';
import { ListOrgSkillsUseCase } from '../../application/skills/list-org-skills.use-case.ts';
import { ReloadOrgSkillsUseCase } from '../../application/skills/reload-org-skills.use-case.ts';
import type { UpdateInstalledSkillResponse } from '../../application/skills/update-installed-skill.use-case.ts';
import { UpdateInstalledSkillUseCase } from '../../application/skills/update-installed-skill.use-case.ts';

@Controller('orgs/:orgId/skills')
export class SkillsController {
  constructor(
    private readonly listSkills: ListOrgSkillsUseCase,
    private readonly effectiveSkills: GetEffectiveSkillsUseCase,
    private readonly createSkill: CreateOrgSkillUseCase,
    private readonly reloadSkills: ReloadOrgSkillsUseCase,
    private readonly deleteSkill: DeleteOrgSkillUseCase,
    private readonly discoverSkills: DiscoverRepoSkillsUseCase,
    private readonly installSkills: InstallRepoSkillsUseCase,
    private readonly updateSkill: UpdateInstalledSkillUseCase,
  ) {}

  @Get()
  list(@Param('orgId') orgId: string): Promise<ListOrgSkillsResponse> {
    return this.listSkills.execute({ orgId });
  }

  @Get('effective')
  effective(
    @Param('orgId') orgId: string,
    @Query(EffectiveSkillsQuerySchema) query: EffectiveSkillsQuery,
  ): Promise<ListEffectiveSkillsResponse> {
    return this.effectiveSkills.execute({ orgId, agentId: query.agentId });
  }

  @Post()
  @HttpCode(201)
  create(
    @Param('orgId') orgId: string,
    @Body(CreateOrgSkillBodySchema) body: CreateOrgSkillBody,
  ): CreateOrgSkillResponse {
    return this.createSkill.execute({ orgId, body });
  }

  @Post('reload')
  reload(@Param('orgId') orgId: string): Promise<ListOrgSkillsResponse> {
    return this.reloadSkills.execute({ orgId });
  }

  @Delete(':name')
  @HttpCode(204)
  async delete(@Param('orgId') orgId: string, @Param('name') name: string): Promise<void> {
    await this.deleteSkill.execute({ orgId, name });
  }

  @Post('discover')
  @HttpCode(200)
  discover(
    @Param('orgId') orgId: string,
    @Body(DiscoverSkillsBodySchema) body: DiscoverSkillsBody,
  ): Promise<DiscoverSkillsResponse> {
    return this.discoverSkills.execute({ orgId, body });
  }

  @Post('install')
  @HttpCode(201)
  install(
    @Param('orgId') orgId: string,
    @Body(InstallSkillsBodySchema) body: InstallSkillsBody,
  ): Promise<InstallSkillsResponse> {
    return this.installSkills.execute({ orgId, body });
  }

  @Post(':name/update')
  @HttpCode(200)
  update(
    @Param('orgId') orgId: string,
    @Param('name') name: string,
  ): Promise<UpdateInstalledSkillResponse> {
    return this.updateSkill.execute({ orgId, name });
  }
}
