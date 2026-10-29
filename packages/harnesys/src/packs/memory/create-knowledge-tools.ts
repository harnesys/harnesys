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

const NOT_CONFIGURED = {
  error: true as const,
  code: 'KNOWLEDGE_NOT_CONFIGURED',
  message: 'knowledge sourceIds not configured on capability scope',
};

export function createKnowledgeTools(params: CreateKnowledgeToolsParams): ToolDefinition[] {
  const { port, resolveScope } = params;
  const configuredTopK = params.topK;
  let topKOf: (() => number | undefined) | undefined;
  if (typeof configuredTopK === 'function') {
    topKOf = configuredTopK;
  } else if (configuredTopK !== undefined) {
    topKOf = () => configuredTopK;
  }
  return [
    tool('knowledge_search', {
      group: 'memory',
      description: 'Search the knowledge corpus (docs / wiki)',
      input: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          sourceId: { type: 'string', description: 'shared source id to search' },
          limit: { type: 'integer', minimum: 1, description: 'Max hits' },
        },
        required: ['query'],
        additionalProperties: false,
      },
      sideEffect: 'read',
      async execute(input) {
        const parsed = input as KnowledgeSearchToolInput;
        const sourceId = resolveSourceId(resolveScope(), parsed.sourceId);
        if (sourceId === undefined) {
          return NOT_CONFIGURED;
        }
        return await port.search({
          sourceId,
          query: parsed.query,
          limit: parsed.limit ?? topKOf?.(),
        });
      },
    }),
    tool('knowledge_read', {
      group: 'memory',
      description: 'Read a knowledge document by id from search hits',
      input: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Knowledge chunk / document id' },
          sourceId: { type: 'string', description: 'shared source id that owns the chunk' },
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
            message: 'knowledge port has no read()',
          };
        }
        const sourceId = resolveSourceId(resolveScope(), parsed.sourceId);
        if (sourceId === undefined) {
          return NOT_CONFIGURED;
        }
        return await port.read({
          sourceId,
          id: parsed.id,
        });
      },
    }),
  ];
}

function resolveSourceId(scope: CapabilityScope, explicit?: string): string | undefined {
  if (explicit !== undefined && explicit.length > 0) {
    if (scope.sourceIds.length === 0 || scope.sourceIds.includes(explicit)) {
      return explicit;
    }
    return undefined;
  }
  return scope.sourceIds[0];
}
