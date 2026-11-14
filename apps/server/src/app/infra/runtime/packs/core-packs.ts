import {
  agentsCapability,
  coreCapability,
  filesCapability,
  githubCapability,
  googleCapability,
  imageCapability,
  issuesCapability,
  knowledgeMemoryCapability,
  managerCapability,
  mcpCapability,
  type Pack,
  type PackRegistration,
  pinMemoryCapability,
  planCapability,
  registerPack,
  schedulerCapability,
  semanticMemoryCapability,
  shellCapability,
  telegramCapability,
  threadsCapability,
  webCapability,
  webhookCapability,
} from 'harnesys';
import { lspCapability } from 'harnesys/lsp';
import { skillsCapability } from 'harnesys/skills';

const stubScope = () => ({
  orgId: '_',
  agentId: '_',
  sourceIds: [] as string[],
  threadId: '_',
});

function stubRegistration(pack: Pack<never, Record<string, unknown>>): PackRegistration {
  return registerPack(pack as Pack<Record<string, unknown>, Record<string, unknown>>, {
    resolveScope: stubScope,
  });
}

export interface CorePackEntry {
  name: string;
  register: () => PackRegistration;
}

export const CORE_PACKS: readonly CorePackEntry[] = [
  { name: 'core', register: () => stubRegistration(coreCapability) },
  { name: 'files', register: () => stubRegistration(filesCapability) },
  { name: 'image', register: () => stubRegistration(imageCapability) },
  { name: 'shell', register: () => stubRegistration(shellCapability) },
  { name: 'web', register: () => stubRegistration(webCapability) },
  { name: 'lsp', register: () => stubRegistration(lspCapability) },
  { name: 'agents', register: () => stubRegistration(agentsCapability) },
  { name: 'mcp', register: () => stubRegistration(mcpCapability) },
  { name: 'plan', register: () => stubRegistration(planCapability) },
  { name: 'threads', register: () => stubRegistration(threadsCapability) },
  { name: 'scheduler', register: () => stubRegistration(schedulerCapability) },
  { name: 'webhook', register: () => stubRegistration(webhookCapability) },
  { name: 'issues', register: () => stubRegistration(issuesCapability) },
  { name: 'manager', register: () => stubRegistration(managerCapability) },
  { name: 'google', register: () => stubRegistration(googleCapability) },
  { name: 'github', register: () => stubRegistration(githubCapability) },
  { name: 'pin-memory', register: () => stubRegistration(pinMemoryCapability) },
  { name: 'semantic-memory', register: () => stubRegistration(semanticMemoryCapability) },
  { name: 'knowledge-memory', register: () => stubRegistration(knowledgeMemoryCapability) },
  { name: 'skills', register: () => stubRegistration(skillsCapability) },
  { name: 'telegram', register: () => stubRegistration(telegramCapability) },
];
