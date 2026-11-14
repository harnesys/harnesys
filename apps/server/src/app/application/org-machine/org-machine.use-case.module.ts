import { Module } from '@harnesys/brix';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
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
  imports: [SourceUseCaseModule, AgentUseCaseModule],
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
