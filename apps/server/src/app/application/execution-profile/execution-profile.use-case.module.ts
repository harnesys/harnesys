import { Module } from '@harnesys/brix';
import { CreateExecutionProfileUseCase } from './create-execution-profile.use-case.ts';
import { DeleteExecutionProfileUseCase } from './delete-execution-profile.use-case.ts';
import { GetExecutionProfileUseCase } from './get-execution-profile.use-case.ts';
import { ListExecutionProfilesUseCase } from './list-execution-profiles.use-case.ts';
import { SetDefaultExecutionProfileUseCase } from './set-default-execution-profile.use-case.ts';
import { SetExecutionProfileNodesUseCase } from './set-execution-profile-nodes.use-case.ts';
import { UpdateExecutionProfileUseCase } from './update-execution-profile.use-case.ts';

@Module({
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
