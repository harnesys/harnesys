import { Module } from '@harnesys/brix';
import { EventsWatchHubPort } from '../../domain/events-watch/events-watch-hub.port.ts';
import { ApprovalModule } from '../approvals/approval.module.ts';
import { ConnectorModule } from '../connector/connector.module.ts';
import { DeskModule } from '../desk/desk.module.ts';
import { FleetHubModule } from '../fleet-hub/fleet-hub.module.ts';
import { IssueInfraModule } from '../issues/issue.module.ts';
import { KnowledgeModule } from '../knowledge/knowledge.module.ts';
import { PlanModule } from '../plan/plan.module.ts';
import { ReleaseModule } from '../release/release.module.ts';
import { SkillsModule } from '../skills/skills.module.ts';
import { SourceModule } from '../source/source.module.ts';
import { SourceWatchModule } from '../source/source-watch.module.ts';
import { TerminalModule } from '../terminal/terminal.module.ts';
import { ThreadModule } from '../thread/thread.module.ts';
import { EventsWatchBridge } from './events-watch-bridge.ts';
import { EVENTS_WATCH_HUB_OPTIONS, EventsWatchHub } from './events-watch-hub.ts';

@Module({
  imports: [
    KnowledgeModule,
    ApprovalModule,
    PlanModule,
    IssueInfraModule,
    DeskModule,
    SourceModule,
    SourceWatchModule,
    SkillsModule,
    ThreadModule,
    FleetHubModule,
    ReleaseModule,
    TerminalModule,
    ConnectorModule,
  ],
  providers: [
    { provide: EventsWatchHubPort, useClass: EventsWatchHub },
    { provide: EVENTS_WATCH_HUB_OPTIONS, useValue: {} },
    EventsWatchBridge,
  ],
  exports: [EventsWatchHubPort],
})
export class EventsWatchModule {}
