import { IssueValidationException } from '../../domain/issue/issue.error.ts';
import { IssueLabelRepositoryPort } from '../../domain/issue/label-repository.port.ts';

export function resolveIssueLabels(
  labels: IssueLabelRepositoryPort,
  orgId: string,
  entries: string[],
): string[] {
  return entries.map((entry) => {
    if (labels.findById(orgId, entry) !== undefined) {
      return entry;
    }
    const byTitle = labels.listByOrg(orgId).find((label) => label.title === entry);
    if (byTitle !== undefined) {
      return byTitle.id;
    }
    throw new IssueValidationException(
      `unknown label: ${entry} (no label with this id or title; create it first with label_create)`,
    );
  });
}
