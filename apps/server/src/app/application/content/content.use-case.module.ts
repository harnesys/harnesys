import { Module } from '@harnesys/brix';
import { ContentModule } from '../../infra/content/content.module.ts';
import { FleetHubModule } from '../../infra/fleet-hub/fleet-hub.module.ts';
import { IntegrationModule } from '../../infra/integration/integration.module.ts';
import { MachineHomeModule } from '../../infra/machine-home/machine-home.module.ts';
import { SecretModule } from '../../infra/secret/secret.module.ts';
import { SourceModule } from '../../infra/source/source.module.ts';
import { CopyPathsUseCase } from './copy-paths.use-case.ts';
import { DownloadPathUseCase } from './download-path.use-case.ts';
import { DuplicatePathUseCase } from './duplicate-path.use-case.ts';
import { ImportPathsUseCase } from './import-paths.use-case.ts';
import { ListTreeUseCase } from './list-tree.use-case.ts';
import { MkdirUseCase } from './mkdir.use-case.ts';
import { MovePathsUseCase } from './move-paths.use-case.ts';
import { ReadFileUseCase } from './read-file.use-case.ts';
import { RemovePathUseCase } from './remove-path.use-case.ts';
import { RevealPathUseCase } from './reveal-path.use-case.ts';
import { StatPathUseCase } from './stat-path.use-case.ts';
import { WriteFileUseCase } from './write-file.use-case.ts';

@Module({
  imports: [
    ContentModule,
    FleetHubModule,
    IntegrationModule,
    MachineHomeModule,
    SecretModule,
    SourceModule,
  ],
  providers: [
    ListTreeUseCase,
    ReadFileUseCase,
    WriteFileUseCase,
    MkdirUseCase,
    MovePathsUseCase,
    CopyPathsUseCase,
    ImportPathsUseCase,
    RemovePathUseCase,
    StatPathUseCase,
    DuplicatePathUseCase,
    RevealPathUseCase,
    DownloadPathUseCase,
  ],
  exports: [
    ListTreeUseCase,
    ReadFileUseCase,
    WriteFileUseCase,
    MkdirUseCase,
    MovePathsUseCase,
    CopyPathsUseCase,
    ImportPathsUseCase,
    RemovePathUseCase,
    StatPathUseCase,
    DuplicatePathUseCase,
    RevealPathUseCase,
    DownloadPathUseCase,
  ],
})
export class ContentUseCaseModule {}
