import type { AutomationItem, AutomationKind } from '@harnesys/contracts';

export abstract class AutomationReadModelPort {
  abstract items(orgId: string): AutomationItem[];

  abstract kinds(orgId: string): AutomationKind[];
}
