const REPOSITORY_WORKTREE_BRANCH_UNIQUE_SQL = `
CREATE UNIQUE INDEX repository_worktrees_active_branch_unique
  ON repository_worktrees(org_id, source_id, host_id, branch)
  WHERE state IN ('creating', 'ready', 'removing');
`;

const REPOSITORY_WORKTREE_BRANCH_DUPES_SQL = `
SELECT org_id, source_id, host_id, branch, COUNT(*) AS total
  FROM repository_worktrees
  WHERE state IN ('creating', 'ready', 'removing')
  GROUP BY org_id, source_id, host_id, branch
  HAVING COUNT(*) > 1;
`;

const REPOSITORY_WORKTREE_BRANCH_UNIQUE_NAME = 'repository_worktrees_active_branch_unique';

interface IndexInfo {
  name: string;
}

export function migrateRepositoryWorktreeBranchUniqueIndex(
  exec: (sql: string) => void,
  all: (sql: string) => IndexInfo[],
): number {
  const indexes = all(`PRAGMA index_list(repository_worktrees)`);
  if (indexes.some((index) => index.name === REPOSITORY_WORKTREE_BRANCH_UNIQUE_NAME)) {
    return 0;
  }
  try {
    exec(REPOSITORY_WORKTREE_BRANCH_UNIQUE_SQL);
    return 0;
  } catch {
    return all(REPOSITORY_WORKTREE_BRANCH_DUPES_SQL).length;
  }
}
