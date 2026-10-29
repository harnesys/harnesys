import type { Source } from '@harnesys/contracts';
import type { SourceRecord } from '../../domain/source/source-registry.port.ts';

export function toPublicSource(row: SourceRecord, updatedAt?: string): Source {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    description: null,
    distribution: row.distribution,
    uiVisibility: row.uiVisibility,
    managed: row.managed,
    vcs: row.vcs,
    availability: row.availability,
    createdAt: row.createdAt,
    updatedAt: updatedAt ?? row.updatedAt,
  };
}
