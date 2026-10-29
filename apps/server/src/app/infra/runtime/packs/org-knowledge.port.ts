import type {
  CapabilityScope,
  KnowledgeHit,
  KnowledgePort,
  KnowledgeReadInput,
  KnowledgeReadResult,
  KnowledgeSearchInput,
} from 'harnesys';
import {
  KnowledgeSourceNotFoundException,
  KnowledgeValidationException,
} from '../../../domain/knowledge/knowledge.error.ts';
import type { KnowledgeSearchPort } from '../../../domain/knowledge/knowledge-search.port.ts';
import type { KnowledgeStorePort } from '../../../domain/knowledge/knowledge-store.port.ts';
import type { SourceRegistryPort } from '../../../domain/source/source-registry.port.ts';

export interface OrgKnowledgeDeps {
  search: KnowledgeSearchPort;
  store: KnowledgeStorePort;
  sources: SourceRegistryPort;
}

export interface OrgKnowledgePortDeps extends OrgKnowledgeDeps {
  orgId: string;
  resolveScope: () => CapabilityScope;
}

export class OrgKnowledgePort implements KnowledgePort {
  constructor(private readonly deps: OrgKnowledgePortDeps) {}

  search(input: KnowledgeSearchInput): Promise<KnowledgeHit[]> {
    const sourceId = this.requireSource(input.sourceId);
    return this.deps.search.search(this.deps.orgId, sourceId, input.query, input.limit);
  }

  read(input: KnowledgeReadInput): Promise<KnowledgeReadResult> {
    const sourceId = this.requireSource(input.sourceId);
    return Promise.resolve(this.deps.store.readChunk(this.deps.orgId, sourceId, input.id));
  }

  private requireSource(sourceId: string): string {
    const resolved = resolveSourceId(sourceId, this.deps.resolveScope());
    if (!this.deps.sources.findById(this.deps.orgId, resolved)) {
      throw new KnowledgeSourceNotFoundException(resolved);
    }
    return resolved;
  }
}

function resolveSourceId(sourceId: string, scope: CapabilityScope): string {
  const explicit = sourceId.trim();
  if (explicit !== '') {
    return explicit;
  }
  const fallback = scope.sourceIds[0] ?? '';
  if (fallback === '') {
    throw new KnowledgeValidationException('knowledge-memory: no source in scope');
  }
  return fallback;
}
