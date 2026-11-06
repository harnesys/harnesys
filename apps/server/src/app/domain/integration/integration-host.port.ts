import type { AutomationItem, AutomationKind } from '@harnesys/contracts';

export interface IntegrationRequest {
  orgId: string;
  integrationId: string;
  method: string;
  pathname: string;
  query: Record<string, string>;
  body: unknown;
}

export abstract class IntegrationHostPort {
  abstract handle(request: IntegrationRequest): Promise<Response>;
  abstract automationItems(orgId: string): AutomationItem[];
  abstract automationKinds(orgId: string): AutomationKind[];
}
