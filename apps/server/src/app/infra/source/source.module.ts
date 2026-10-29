import { Module } from '@harnesys/brix';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import { MaterializationEventsPort } from '../../domain/source/materialization-events.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceOperationGrantPort } from '../../domain/source/source-operation-grant.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { RepositoryWorktreeAdapter } from '../org-sqlite/repository-worktree.adapter.ts';
import { SourceOperationGrantAdapter } from '../org-sqlite/source-operation-grant.adapter.ts';
import { GitDriver } from './drivers/git/git.driver.ts';
import { GitCliAdapter } from './drivers/git/vcs/git-cli.adapter.ts';
import { MaterializationEventsAdapter } from './materialization-events.adapter.ts';
import { SourceLocationAdapter } from './source-location.adapter.ts';
import { SourceMaterializationAdapter } from './source-materialization.adapter.ts';
import { SourceRegistryAdapter } from './source-registry.adapter.ts';

@Module({
  imports: [MachineHomeModule],
  providers: [
    { provide: SourceRegistryPort, useClass: SourceRegistryAdapter },
    { provide: SourceMaterializationPort, useClass: SourceMaterializationAdapter },
    { provide: MaterializationEventsPort, useClass: MaterializationEventsAdapter },
    { provide: SourceLocationPort, useClass: SourceLocationAdapter },
    { provide: SourceOperationGrantPort, useClass: SourceOperationGrantAdapter },
    { provide: RepositoryWorktreePort, useClass: RepositoryWorktreeAdapter },
    { provide: SourceDriverPort, useClass: GitDriver },
    { provide: GitVcsPort, useClass: GitCliAdapter },
  ],
  exports: [
    SourceRegistryPort,
    SourceMaterializationPort,
    MaterializationEventsPort,
    SourceLocationPort,
    SourceOperationGrantPort,
    RepositoryWorktreePort,
    SourceDriverPort,
    GitVcsPort,
  ],
})
export class SourceModule {}
