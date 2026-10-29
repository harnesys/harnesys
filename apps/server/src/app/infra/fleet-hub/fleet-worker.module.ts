import { Module } from '@harnesys/brix';
import { OrgExecutionReplicaPort } from '../../domain/fleet/org-execution-replica.port.ts';
import { PendingRunEventPort } from '../../domain/fleet/pending-run-event.port.ts';
import { KnowledgeModule } from '../knowledge/knowledge.module.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { OrgExecutionReplicaAdapter } from '../org-sqlite/org-execution-replica.adapter.ts';
import { PendingRunEventAdapter } from '../org-sqlite/pending-run-event.adapter.ts';
import { PluginsModule } from '../plugins/plugins.module.ts';
import { WorkspaceContainerModule } from '../process-runtime/workspace-container.module.ts';
import { SecretModule } from '../secret/secret.module.ts';
import { SkillsModule } from '../skills/skills.module.ts';
import { CloudSyncBackModule } from '../source/drivers/cloud/cloud-sync-back.module.ts';
import { SourceModule } from '../source/source.module.ts';
import { FleetHubModule } from './fleet-hub.module.ts';
import { WorkerCloudSyncWatch } from './worker-cloud-sync-watch.ts';
import { WorkerDialerAdapter } from './worker-dialer.adapter.ts';
import { WorkerWorkExecutor } from './worker-work-executor.ts';

@Module({
  imports: [
    MachineHomeModule,
    CloudSyncBackModule,
    FleetHubModule,
    SourceModule,
    SecretModule,
    KnowledgeModule,
    PluginsModule,
    SkillsModule,
    WorkspaceContainerModule,
  ],
  providers: [
    { provide: OrgExecutionReplicaPort, useClass: OrgExecutionReplicaAdapter },
    { provide: PendingRunEventPort, useClass: PendingRunEventAdapter },
    WorkerWorkExecutor,
    WorkerCloudSyncWatch,
    WorkerDialerAdapter,
  ],
  exports: [OrgExecutionReplicaPort, PendingRunEventPort],
})
export class FleetWorkerModule {}
