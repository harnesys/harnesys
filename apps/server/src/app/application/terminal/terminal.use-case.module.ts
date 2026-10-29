import { Module } from '@harnesys/brix';
import { MachineHomeModule } from '../../infra/machine-home/machine-home.module.ts';
import { SourceModule } from '../../infra/source/source.module.ts';
import { TerminalModule } from '../../infra/terminal/terminal.module.ts';
import { CreateTerminalSessionUseCase } from './create-terminal-session.use-case.ts';
import { DeleteTerminalSessionUseCase } from './delete-terminal-session.use-case.ts';
import { ListTerminalSessionsUseCase } from './list-terminal-sessions.use-case.ts';

@Module({
  imports: [MachineHomeModule, SourceModule, TerminalModule],
  providers: [
    ListTerminalSessionsUseCase,
    CreateTerminalSessionUseCase,
    DeleteTerminalSessionUseCase,
  ],
  exports: [
    ListTerminalSessionsUseCase,
    CreateTerminalSessionUseCase,
    DeleteTerminalSessionUseCase,
  ],
})
export class TerminalUseCaseModule {}
