export function worktreeFilesTreeQueryKey(
  projectId: string,
  worktreeId: string,
  includeHidden?: boolean,
) {
  return includeHidden === undefined
    ? (['sources', projectId, 'worktrees', worktreeId, 'files-tree'] as const)
    : ([
        'sources',
        projectId,
        'worktrees',
        worktreeId,
        'files-tree',
        includeHidden ? 'hidden' : 'visible',
      ] as const);
}
