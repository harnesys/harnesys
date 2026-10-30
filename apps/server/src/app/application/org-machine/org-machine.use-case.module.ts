import { Module } from '@harnesys/brix';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { DeskModule } from '../../infra/desk/desk.module.ts';
import { ExecutionProfileModule } from '../../infra/execution-profile/execution-profile.module.ts';
import { FleetHubModule } from '../../infra/fleet-hub/fleet-hub.module.ts';
import { IdentitySqliteModule } from '../../infra/identity-sqlite/identity-sqlite.module.ts';
import { MachineHomeModule } from '../../infra/machine-home/machine-home.module.ts';
import { PresetsModule } from '../../infra/presets/presets.module.ts';
import { ScheduleModule } from '../../infra/schedules/schedule.module.ts';
import { SkillsModule } from '../../infra/skills/skills.module.ts';
import { AgentUseCaseModule } from '../agents/agent.use-case.module.ts';
import { SourceUseCaseModule } from '../source/source.use-case.module.ts';
import { ActivateOrgUseCase } from './activate-org.use-case.ts';
import { CreateRelayOrgUseCase } from './create-relay-org.use-case.ts';
import { DeleteOrgUseCase } from './delete-org.use-case.ts';
import { GetOrgSettingsUseCase } from './get-org-settings.use-case.ts';
import { ListOrgsUseCase } from './list-orgs.use-case.ts';
import { SetOrgSettingsUseCase } from './set-org-settings.use-case.ts';
import { UpdateOrgUseCase } from './update-org.use-case.ts';

@Module({
  imports: [
    IdentitySqliteModule,
    MachineHomeModule,
    SourceUseCaseModule,
    SkillsModule,
    ScheduleModule,
    ExecutionProfileModule,
    FleetHubModule,
    DeskModule,
    AgentUseCaseModule,
    PresetsModule,
  ],
  providers: [
    CreateRelayOrgUseCase,
    ListOrgsUseCase,
    ActivateOrgUseCase,
    UpdateOrgUseCase,
    DeleteOrgUseCase,
    GetOrgSettingsUseCase,
    SetOrgSettingsUseCase,
  ],
  exports: [
    CreateRelayOrgUseCase,
    ListOrgsUseCase,
    ActivateOrgUseCase,
    UpdateOrgUseCase,
    DeleteOrgUseCase,
    GetOrgSettingsUseCase,
    SetOrgSettingsUseCase,
    MachineConfigPort,
    OrgSettingsPort,
  ],
})
export class OrgMachineUseCaseModule {}
