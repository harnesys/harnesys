import {
  agentsCapability,
  coreCapability,
  episodicMemoryCapability,
  filesCapability,
  githubCapability,
  googleCapability,
  imageCapability,
  issuesCapability,
  knowledgeMemoryCapability,
  managerCapability,
  mcpCapability,
  type PackCatalogEntry,
  type PackRegistration,
  packCatalog,
  pinMemoryCapability,
  planCapability,
  registerPack,
  schedulerCapability,
  semanticMemoryCapability,
  shellCapability,
  threadsCapability,
  webCapability,
  webhookCapability,
} from 'harnesys';
import { lspCapability } from 'harnesys/lsp';
import { skillsCapability } from 'harnesys/skills';
import { orgPackNames } from '../../infra/runtime/packs/org-pack-list.ts';

const stubScope = () => ({
  orgId: '_',
  agentId: '_',
  sourceIds: [] as string[],
  threadId: '_',
});

function registrationForPack(packName: string) {
  switch (packName) {
    case 'core':
      return registerPack(coreCapability, { resolveScope: stubScope });
    case 'files':
      return registerPack(filesCapability, { resolveScope: stubScope });
    case 'image':
      return registerPack(imageCapability, { resolveScope: stubScope });
    case 'shell':
      return registerPack(shellCapability, { resolveScope: stubScope });
    case 'web':
      return registerPack(webCapability, { resolveScope: stubScope });
    case 'lsp':
      return registerPack(lspCapability, { resolveScope: stubScope });
    case 'agents':
      return registerPack(agentsCapability, { resolveScope: stubScope });
    case 'plan':
      return registerPack(planCapability, { resolveScope: stubScope });
    case 'threads':
      return registerPack(threadsCapability, { resolveScope: stubScope });
    case 'scheduler':
      return registerPack(schedulerCapability, { resolveScope: stubScope });
    case 'webhook':
      return registerPack(webhookCapability, { resolveScope: stubScope });
    case 'issues':
      return registerPack(issuesCapability, { resolveScope: stubScope });
    case 'manager':
      return registerPack(managerCapability, { resolveScope: stubScope });
    case 'mcp':
      return registerPack(mcpCapability, { resolveScope: stubScope });
    case 'google':
      return registerPack(googleCapability, { resolveScope: stubScope });
    case 'github':
      return registerPack(githubCapability, { resolveScope: stubScope });
    case 'pin-memory':
      return registerPack(pinMemoryCapability, { resolveScope: stubScope });
    case 'semantic-memory':
      return registerPack(semanticMemoryCapability, { resolveScope: stubScope });
    case 'episodic-memory':
      return registerPack(episodicMemoryCapability, { resolveScope: stubScope });
    case 'knowledge-memory':
      return registerPack(knowledgeMemoryCapability, { resolveScope: stubScope });
    case 'skills':
      return registerPack(skillsCapability, { resolveScope: stubScope });
    default:
      return undefined;
  }
}

export function orgPackRegistrations(): PackRegistration[] {
  return orgPackNames().flatMap((packName) => {
    const registration = registrationForPack(packName);
    return registration ? [registration] : [];
  }) as PackRegistration[];
}

export function listOrgPackCatalog(): PackCatalogEntry[] {
  return packCatalog(orgPackRegistrations());
}

export function listOrgCatalogTools(): Array<{
  name: string;
  description: string;
  group?: string;
}> {
  const tools: Array<{ name: string; description: string; group?: string }> = [];
  const seen = new Set<string>();
  for (const pack of listOrgPackCatalog()) {
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
