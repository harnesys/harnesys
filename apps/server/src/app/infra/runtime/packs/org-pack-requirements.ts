import { isHostWired } from '../../../domain/runtime/org-pack-list.ts';
import type { WireOrgPackFilter } from './wire-org-packs.ts';

const MEMORY_PACK_NAMES: ReadonlySet<string> = new Set(['pin-memory', 'semantic-memory']);

export function isPackSatisfied(packName: string, deps: WireOrgPackFilter): boolean {
  if (!isHostWired(packName)) {
    return false;
  }
  return packDependencySatisfied(packName, deps);
}

function packDependencySatisfied(packName: string, deps: WireOrgPackFilter): boolean {
  switch (packName) {
    case 'threads':
      return deps.threads !== undefined;
    case 'issues':
      return deps.issues !== undefined || deps.issueTracker !== undefined;
    case 'manager':
      return deps.manager !== undefined;
    case 'knowledge-memory':
      return deps.knowledge !== undefined && deps.sources !== undefined;
    case 'skills':
      return deps.skills !== undefined;
    case 'mcp':
      return deps.mcpManage !== undefined;
    case 'lsp':
      return deps.lsp !== undefined;
    default:
      return hasDbDeps(packName, deps);
  }
}

function hasDbDeps(packName: string, deps: WireOrgPackFilter): boolean {
  if (packName === 'plan') {
    return deps.planDb !== undefined;
  }
  if (MEMORY_PACK_NAMES.has(packName)) {
    return deps.memoryDb !== undefined;
  }
  return true;
}
