import type { KnowledgeHit } from 'harnesys';

export abstract class KnowledgeSearchPort {
  abstract search(
    orgId: string,
    sourceId: string,
    query: string,
    limit?: number,
  ): Promise<KnowledgeHit[]>;
}
