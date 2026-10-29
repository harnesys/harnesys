import { Injectable } from '@harnesys/brix';
import {
  type AppendIntegrationEventInput,
  type IntegrationEventAppendResult,
  type IntegrationEventRecord,
  IntegrationEventsPort,
} from '../../domain/integration/integration-events.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  appendIntegrationEvent,
  listRecentIntegrationEvents,
} from '../org-sqlite/org-sql-integration-events.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';

@Injectable()
export class IntegrationEventsAdapter extends IntegrationEventsPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  append(input: AppendIntegrationEventInput): IntegrationEventAppendResult {
    return withOrgSqlite(this.layout, input.orgId, (db) =>
      appendIntegrationEvent(
        (sql) => {
          db.run(sql);
        },
        (sql) => db.all(sql) as Array<Record<string, unknown>>,
        {
          id: crypto.randomUUID(),
          orgId: input.orgId,
          integrationId: input.integrationId,
          deliveryId: input.deliveryId,
          eventType: input.eventType,
          payloadJson: input.payloadJson,
          createdAt: new Date().toISOString(),
        },
      ),
    );
  }

  listRecent(orgId: string, integrationId: string, limit: number): IntegrationEventRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      listRecentIntegrationEvents(
        (sql) => db.all(sql) as Array<Record<string, unknown>>,
        orgId,
        integrationId,
        limit,
      ),
    );
  }
}
