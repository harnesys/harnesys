import { Injectable } from '@harnesys/brix';
import { DashboardsNotifierPort } from '../../domain/dashboards/dashboards-notifier.port.ts';
import { EventBusPort } from '../../domain/events/event-bus.port.ts';
import { EventsWatchHubPort } from '../../domain/events-watch/events-watch-hub.port.ts';

export const DASHBOARDS_CHANGED_EVENT = 'dashboards.changed';

@Injectable()
export class DashboardsNotifierAdapter extends DashboardsNotifierPort {
  constructor(
    private readonly events: EventBusPort,
    private readonly watchHub: EventsWatchHubPort,
  ) {
    super();
  }

  override changed(
    orgId: string,
    dashboardId: string,
    reason: string,
    payload: Record<string, unknown> = {},
  ): void {
    const frame = { dashboardId, reason, ...payload };
    this.events.publish(orgId, DASHBOARDS_CHANGED_EVENT, frame);
    this.watchHub.publish(orgId, DASHBOARDS_CHANGED_EVENT, frame);
  }
}
