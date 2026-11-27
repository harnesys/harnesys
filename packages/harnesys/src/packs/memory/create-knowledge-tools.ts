import type { CapabilityScope } from '../../domain/pack.ts';
import type { KnowledgePort } from '../../ports/memory.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';

export interface CreateKnowledgeToolsParams {
  port: KnowledgePort;
  resolveScope: () => CapabilityScope;
  topK?: number | (() => number | undefined);
}

interface KnowledgeSearchToolInput {
  query: string;
  sourceId?: string;
  limit?: number;
}

interface KnowledgeReadToolInput {
  id: string;
  sourceId?: string;
}

interface KnowledgeToolError {
  error: true;
  code: string;
  message: string;
}

const NOT_CONFIGURED: KnowledgeToolError = {
  error: true,
  code: 'KNOWLEDGE_NOT_CONFIGURED',
  message:
    'no knowledge source is shared with this run. Steps for the user: open the Sources page → add the documents (repository or folder) → share the source with this agent (agent settings → Sources) → in Sources → the source → enable indexing (pick paths or "index entire source") → run reindex. knowledge_search answers once the first chunk is indexed; report these steps instead of retrying.',
};
function sourceNotShared(sourceId: string): KnowledgeToolError {
  return {
    error: true,
    code: 'KNOWLEDGE_SOURCE_NOT_SHARED',
    message: `source "${sourceId}" is not among the knowledge sources shared with this run. Ask the user to share it: Sources page → ${sourceId} → share to this agent, then index it (select paths or "index entire source").`,
  };
}
function sourceNotIndexed(sourceId: string): KnowledgeToolError {
  return {
    error: true,
    code: 'KNOWLEDGE_SOURCE_NOT_INDEXED',
    message: `source "${sourceId}" is shared with this run but nothing is indexed in it yet, so a search cannot match anything. Ask the user: Sources page → ${sourceId} → add paths to the knowledge index (or switch it to "index entire source") → start reindex; then search again.`,
  };
}
function noSharedSourceIndexed(sourceIds: readonly string[]): KnowledgeToolError {
  return {
    error: true,
    code: 'KNOWLEDGE_SOURCE_NOT_INDEXED',
    message: `none of the knowledge sources shared with this run (${sourceIds.join(', ')}) has an indexed corpus yet, so a search cannot match anything. Ask the user: Sources page → pick a source → add paths to the knowledge index (or "index entire source") → start reindex; then search again.`,
  };
}

export function createKnowledgeTools(params: CreateKnowledgeToolsParams): ToolDefinition[] {
  const { port, resolveScope } = params;
  const configuredTopK = params.topK;
  let topKOf: (() => number | undefined) | undefined;
  if (typeof configuredTopK === 'function') {
    topKOf = configuredTopK;
  } else if (configuredTopK !== undefined) {
    topKOf = () => configuredTopK;
  }
  async function pickCorpus(
    scope: CapabilityScope,
    explicit: string | undefined,
  ): Promise<{ sourceId: string } | { error: KnowledgeToolError }> {
    const shared = scope.sourceIds;
    if (shared.length === 0) {
      return { error: NOT_CONFIGURED };
    }
    const wanted = explicit !== undefined && explicit.length > 0 ? explicit : undefined;
    if (wanted !== undefined && !shared.includes(wanted)) {
      return { error: sourceNotShared(wanted) };
    }
    const candidates = wanted === undefined ? [...shared] : [wanted];
    const indexed = [...(await port.indexedSources(candidates))];
    if (wanted !== undefined) {
      return indexed.includes(wanted) ? { sourceId: wanted } : { error: sourceNotIndexed(wanted) };
    }
    const first = shared.find((id) => indexed.includes(id));
    return first === undefined ? { error: noSharedSourceIndexed(shared) } : { sourceId: first };
  }
  return [
    tool('knowledge_search', {
      group: 'memory',
      description:
        'Search the knowledge corpus of the sources shared with this run; omit sourceId to search the first indexed shared source. An empty result means "indexed, no matches" — a missing or unindexed source returns an actionable error (KNOWLEDGE_NOT_CONFIGURED / KNOWLEDGE_SOURCE_NOT_SHARED / KNOWLEDGE_SOURCE_NOT_INDEXED) whose message lists the user-facing setup steps: relay them instead of retrying.',
      input: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          sourceId: { type: 'string', description: 'must be a source shared with this run' },
          limit: { type: 'integer', minimum: 1, description: 'Max hits' },
        },
        required: ['query'],
        additionalProperties: false,
      },
      sideEffect: 'read',
      async execute(input) {
        const parsed = input as KnowledgeSearchToolInput;
        const picked = await pickCorpus(resolveScope(), parsed.sourceId);
        if ('error' in picked) {
          return picked.error;
        }
        return await port.search({
          sourceId: picked.sourceId,
          query: parsed.query,
          limit: parsed.limit ?? topKOf?.(),
        });
      },
    }),
    tool('knowledge_read', {
      group: 'memory',
      description:
        'Read a knowledge document by id from search hits; the owning source must be shared with this run. Missing setup answers with the same actionable errors as knowledge_search.',
      input: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Knowledge chunk / document id' },
          sourceId: {
            type: 'string',
            description: 'must be a source shared with this run',
          },
        },
        required: ['id'],
        additionalProperties: false,
      },
      sideEffect: 'read',
      async execute(input) {
        const parsed = input as KnowledgeReadToolInput;
        if (!port.read) {
          return {
            error: true,
            code: 'KNOWLEDGE_READ_UNSUPPORTED',
            message:
              'this knowledge port has no read(): relay to the user that document reading is unavailable for it; search hits still carry their text',
          } satisfies KnowledgeToolError;
        }
        const picked = await pickCorpus(resolveScope(), parsed.sourceId);
        if ('error' in picked) {
          return picked.error;
        }
        return await port.read({
          sourceId: picked.sourceId,
          id: parsed.id,
        });
      },
    }),
  ];
}
