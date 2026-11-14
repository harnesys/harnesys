import type { AutomationItem, AutomationKind } from '@harnesys/contracts';

export abstract class AutomationCatalogPort {
  abstract items(orgId: string): AutomationItem[];

  abstract kinds(orgId: string): AutomationKind[];
}
