import { DEFAULT_KNOWLEDGE_TOP_K } from '../../constants.ts';
import { definePack } from '../../domain/pack.ts';
import type { KnowledgePort } from '../../ports/memory.ts';
import { createKnowledgeTools } from './create-knowledge-tools.ts';
export interface KnowledgeMemoryPorts {
  knowledge: KnowledgePort;
}
function topKOf(spec: Record<string, unknown> | undefined): number | undefined {
  const value = spec?.topK;
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}
export const knowledgeMemoryCapability = definePack<KnowledgeMemoryPorts, Record<string, unknown>>({
  name: 'knowledge-memory',
  version: '1.0.0',
  description: 'Indexed corpus: knowledge_search / knowledge_read',
  icon: 'memory-knowledge',
  specSchema: {
    type: 'object',
    properties: {
      store: { type: 'string', enum: ['knowledge'], default: 'knowledge' },
      topK: { type: 'number', default: DEFAULT_KNOWLEDGE_TOP_K },
    },
  },
  meta: {
    tools: [
      { name: 'knowledge_search', description: 'Search the knowledge corpus (docs / wiki)' },
      { name: 'knowledge_read', description: 'Read a knowledge document by id from search hits' },
    ],
    skills: [],
    hasSettings: true,
  },
  create: (ctx) => ({
    tools: createKnowledgeTools({
      port: ctx.ports.knowledge,
      resolveScope: () => ctx.scope,
      topK: topKOf(ctx.spec),
    }),
    notes: () => [
      {
        tag: 'knowledge-memory',
        text: 'Use knowledge_search to locate indexed documents, then knowledge_read for the matching document contents. Cite document identifiers when reporting findings.',
      },
    ],
  }),
});
