import { Injectable } from '@harnesys/brix';
import type { AutomationItem, AutomationKind } from '@harnesys/contracts';
import { AutomationCatalogPort } from '../../domain/automations/automation-catalog.port.ts';
import { AutomationCatalogContributors } from './automation-catalog-contributors.ts';

@Injectable()
export class CompositeAutomationCatalogAdapter extends AutomationCatalogPort {
  constructor(private readonly contributors: AutomationCatalogContributors) {
    super();
  }

  override items(orgId: string): AutomationItem[] {
    const seen = new Set<string>();
    const items: AutomationItem[] = [];
    for (const contributor of this.contributors.contributors) {
      for (const item of contributor.items(orgId)) {
        if (seen.has(item.id)) {
          continue;
        }
        seen.add(item.id);
        items.push(item);
      }
    }
    return items;
  }

  override kinds(orgId: string): AutomationKind[] {
    const seen = new Set<string>();
    const kinds: AutomationKind[] = [];
    for (const contributor of this.contributors.contributors) {
      for (const kind of contributor.kinds(orgId)) {
        if (seen.has(kind.kind)) {
          continue;
        }
        seen.add(kind.kind);
        kinds.push(kind);
      }
    }
    return kinds;
  }
}
