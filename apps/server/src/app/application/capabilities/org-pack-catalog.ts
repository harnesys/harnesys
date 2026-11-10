import type { PackCatalogEntry, PackRegistration } from 'harnesys';
import { packCatalog } from 'harnesys';
import type { PackRegistryPort } from '../../domain/capabilities/pack-registry.port.ts';

export function orgPackRegistrations(registry: PackRegistryPort): PackRegistration[] {
  return registry.registrations();
}

export function listOrgPackCatalog(registry: PackRegistryPort): PackCatalogEntry[] {
  return packCatalog(orgPackRegistrations(registry));
}

export function listOrgCatalogTools(registry: PackRegistryPort): Array<{
  name: string;
  description: string;
  group?: string;
}> {
  const tools: Array<{ name: string; description: string; group?: string }> = [];
  const seen = new Set<string>();
  for (const pack of listOrgPackCatalog(registry)) {
    for (const tool of pack.tools) {
      if (seen.has(tool.name)) {
        continue;
      }
      seen.add(tool.name);
      tools.push({
        name: tool.name,
        description: tool.description,
        group: pack.name,
      });
    }
  }
  return tools;
}
