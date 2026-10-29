import type { CapabilityScope } from '../../domain/pack.ts';
import type { MemoryScopeId } from '../../ports/memory.ts';
export function memoryScopeOf(resolveScope: () => CapabilityScope): () => MemoryScopeId {
  return () => {
    const scope = resolveScope();
    return {
      orgId: scope.orgId,
      agentName: scope.agentName ?? scope.agentId,
      threadId: scope.threadId,
    };
  };
}
