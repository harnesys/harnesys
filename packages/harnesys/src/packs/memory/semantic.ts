import { DEFAULT_MEMORY_POLICY } from '@harnesys/contracts';
import type { LlmNote, LlmNoteContext } from '../../application/llm-notes.ts';
import {
  DEFAULT_SEMANTIC_AUTO_PROJECT_LONG,
  DEFAULT_SEMANTIC_AUTO_PROJECT_SESSION,
} from '../../constants.ts';
import { definePack, type PackCtx } from '../../domain/pack.ts';
import type { SemanticMemoryPort, SemanticScope } from '../../ports/memory.ts';
import { createSemanticTools } from './create-semantic-tools.ts';
import { memoryScopeOf } from './memory-scope.ts';
export interface SemanticMemoryPorts {
  semantic: SemanticMemoryPort;
}
const PROJECT_CACHE_CAP = 16;
type SemanticCtx = Pick<
  PackCtx<SemanticMemoryPorts, Record<string, unknown>>,
  'ports' | 'spec' | 'scope' | 'policy'
>;
function flagOf(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}
function semanticScopesOf(spec: Record<string, unknown>): SemanticScope[] {
  const scopes: SemanticScope[] = [];
  if (flagOf(spec.autoProjectSession, DEFAULT_SEMANTIC_AUTO_PROJECT_SESSION)) {
    scopes.push('session');
  }
  if (flagOf(spec.autoProjectLong, DEFAULT_SEMANTIC_AUTO_PROJECT_LONG)) {
    scopes.push('long');
  }
  return scopes;
}
async function semanticProjectionNote(ctx: SemanticCtx, noteCtx: LlmNoteContext): Promise<string> {
  if (ctx.policy?.read === false) {
    return '';
  }
  const scopes = semanticScopesOf(ctx.spec);
  if (scopes.length === 0) {
    return '';
  }
  const policy = ctx.policy;
  const scopeId = memoryScopeOf(() => ctx.scope)();
  const minChars = numberOr(policy?.relevanceMinChars, DEFAULT_MEMORY_POLICY.relevanceMinChars);
  const userText = noteCtx.userText;
  if (
    userText !== undefined &&
    userText.length >= minChars &&
    ctx.ports.semantic.projectForQuery !== undefined
  ) {
    return await ctx.ports.semantic.projectForQuery(scopeId, {
      query: userText,
      scopes,
      topK: numberOr(policy?.relevanceTopK, DEFAULT_MEMORY_POLICY.relevanceTopK),
      budgetTokens: numberOr(
        policy?.projectBudgetTokens,
        DEFAULT_MEMORY_POLICY.projectBudgetTokens,
      ),
      clipChars: numberOr(policy?.factClipChars, DEFAULT_MEMORY_POLICY.factClipChars),
      halfLifeDays: policy?.decayHalfLifeDays ?? DEFAULT_MEMORY_POLICY.decayHalfLifeDays,
    });
  }
  const text = await ctx.ports.semantic.projectForWindow?.(scopeId, {
    scopes,
    limit: numberOr(policy?.projectLimit, DEFAULT_MEMORY_POLICY.projectLimit),
    budgetTokens: numberOr(policy?.projectBudgetTokens, DEFAULT_MEMORY_POLICY.projectBudgetTokens),
  });
  return text ?? '';
}
function cachedProjection(
  ctx: SemanticCtx,
  cache: Map<string, string>,
  noteCtx: LlmNoteContext,
): Promise<string> {
  const key = `${noteCtx.sessionId}:${noteCtx.runId}`;
  const hit = cache.get(key);
  if (hit !== undefined) {
    return Promise.resolve(hit);
  }
  return semanticProjectionNote(ctx, noteCtx).then((text) => {
    cache.set(key, text);
    const oldest = cache.keys().next().value;
    if (cache.size > PROJECT_CACHE_CAP && oldest !== undefined) {
      cache.delete(oldest);
    }
    return text;
  });
}
export const semanticMemoryCapability = definePack<SemanticMemoryPorts, Record<string, unknown>>({
  name: 'semantic-memory',
  version: '1.0.0',
  description:
    'Curated semantic memory: memory_write / memory_list / memory_update / memory_delete',
  icon: 'memory-semantic',
  specSchema: {
    type: 'object',
    properties: {
      store: { type: 'string', enum: ['record-store'], default: 'record-store' },
      autoProjectSession: { type: 'boolean', default: DEFAULT_SEMANTIC_AUTO_PROJECT_SESSION },
      autoProjectLong: { type: 'boolean', default: DEFAULT_SEMANTIC_AUTO_PROJECT_LONG },
    },
  },
  meta: {
    tools: [
      {
        name: 'memory_write',
        description: 'Write a curated semantic memory fact (session or long)',
      },
      { name: 'memory_list', description: 'List curated semantic memory facts' },
      { name: 'memory_update', description: 'Update a semantic memory fact text by id' },
      { name: 'memory_delete', description: 'Delete a semantic memory fact by id' },
    ],
    skills: [],
    hasSettings: true,
  },
  create: (ctx) => {
    const cache = new Map<string, string>();
    return {
      tools: createSemanticTools({
        port: ctx.ports.semantic,
        resolveScope: memoryScopeOf(() => ctx.scope),
      }),
      notes: [
        () => [
          {
            tag: 'semantic-memory',
            text: 'Store stable facts and preferences that will improve future work. Keep one fact per memory and avoid secrets or temporary task state.',
          },
        ],
        async (noteCtx: LlmNoteContext) => {
          const text = await cachedProjection(ctx, cache, noteCtx);
          return text === '' ? [] : [{ tag: 'memory-semantic', text } satisfies LlmNote];
        },
      ],
    };
  },
});
