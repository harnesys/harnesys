import { KnowledgeIndexPane } from '@/features/manage-knowledge-index';
import { getActiveOrgId } from '@/shared/api/active-org';

export function MemoryPane({ projectId }: { projectId: string }) {
  const orgId = getActiveOrgId() ?? '';
  return <KnowledgeIndexPane orgId={orgId} sourceId={projectId} />;
}
