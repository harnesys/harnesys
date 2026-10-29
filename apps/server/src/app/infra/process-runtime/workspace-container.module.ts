import { Module } from '@harnesys/brix';
import { WorkspaceContainerPort } from '../../domain/process-runtime/workspace-container.port.ts';
import {
  DockerWorkspaceAdapter,
  realWorkspaceContainerSeam,
  WORKSPACE_CONTAINER_SEAM,
} from './docker-workspace.adapter.ts';

@Module({
  providers: [
    { provide: WORKSPACE_CONTAINER_SEAM, useValue: realWorkspaceContainerSeam },
    { provide: WorkspaceContainerPort, useClass: DockerWorkspaceAdapter },
  ],
  exports: [WorkspaceContainerPort],
})
export class WorkspaceContainerModule {}
