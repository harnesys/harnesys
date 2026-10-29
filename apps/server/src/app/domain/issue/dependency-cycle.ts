import type { IssueDependencyRecord } from './issue.ts';

export function hasOpenBlockers(
  dependencies: IssueDependencyRecord[],
  issueId: string,
  isClosed: (issueId: string) => boolean,
): boolean {
  return dependencies.some(
    (dep) => dep.issueId === issueId && dep.type === 'blocks' && !isClosed(dep.dependsOnIssueId),
  );
}

export function createsBlocksCycle(
  dependencies: IssueDependencyRecord[],
  issueId: string,
  dependsOnIssueId: string,
): boolean {
  const edges = new Map<string, string[]>();
  for (const dep of dependencies) {
    if (dep.type !== 'blocks') {
      continue;
    }
    const list = edges.get(dep.issueId) ?? [];
    list.push(dep.dependsOnIssueId);
    edges.set(dep.issueId, list);
  }
  const seen = new Set<string>();
  const stack = [...(edges.get(dependsOnIssueId) ?? [])];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === issueId) {
      return true;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    stack.push(...(edges.get(current) ?? []));
  }
  return false;
}
