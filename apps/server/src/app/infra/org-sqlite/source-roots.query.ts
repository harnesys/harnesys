import { eq } from 'drizzle-orm';
import type { SourceRoot } from '../thread/legacy-workspace-ref.ts';
import { sourceMaterializations } from './org.schema.ts';
import type { OrgSqliteDb } from './org-sqlite-session.ts';

export function sourceRootsOf(db: OrgSqliteDb, orgId: string): SourceRoot[] {
  return db
    .select({
      sourceId: sourceMaterializations.sourceId,
      root: sourceMaterializations.localPath,
    })
    .from(sourceMaterializations)
    .where(eq(sourceMaterializations.orgId, orgId))
    .all()
    .filter((row): row is SourceRoot => typeof row.root === 'string' && row.root.length > 0);
}
