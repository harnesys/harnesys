import { Module } from '@harnesys/brix';
import { ExecutionProfileModule } from '../../infra/execution-profile/execution-profile.module.ts';
import { FleetHubModule } from '../../infra/fleet-hub/fleet-hub.module.ts';
import { MachineHomeModule } from '../../infra/machine-home/machine-home.module.ts';
import { CreateExecutionProfileUseCase } from './create-execution-profile.use-case.ts';
import { DeleteExecutionProfileUseCase } from './delete-execution-profile.use-case.ts';
import { GetExecutionProfileUseCase } from './get-execution-profile.use-case.ts';
import { ListExecutionProfilesUseCase } from './list-execution-profiles.use-case.ts';
import { SetDefaultExecutionProfileUseCase } from './set-default-execution-profile.use-case.ts';
import { SetExecutionProfileNodesUseCase } from './set-execution-profile-nodes.use-case.ts';
import { UpdateExecutionProfileUseCase } from './update-execution-profile.use-case.ts';

@Module({
  imports: [ExecutionProfileModule, FleetHubModule, MachineHomeModule],
  providers: [
    ListExecutionProfilesUseCase,
    GetExecutionProfileUseCase,
    CreateExecutionProfileUseCase,
    UpdateExecutionProfileUseCase,
    SetExecutionProfileNodesUseCase,
    SetDefaultExecutionProfileUseCase,
    DeleteExecutionProfileUseCase,
  ],
  exports: [
    ListExecutionProfilesUseCase,
    GetExecutionProfileUseCase,
    CreateExecutionProfileUseCase,
    UpdateExecutionProfileUseCase,
    SetExecutionProfileNodesUseCase,
    SetDefaultExecutionProfileUseCase,
    DeleteExecutionProfileUseCase,
  ],
})
export class ExecutionProfileUseCaseModule {}
