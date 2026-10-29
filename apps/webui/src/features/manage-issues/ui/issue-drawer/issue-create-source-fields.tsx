import type { IssueFormDraft } from '../../model/issue-draft';
import { createWorktreeForBranch } from '../../model/issues';
import { IssueSourceFields } from './issue-source-fields';

export function IssueCreateSourceFields({
  orgId,
  draft,
  onDraftChange,
}: {
  orgId: string;
  draft: IssueFormDraft;
  onDraftChange: (draft: IssueFormDraft) => void;
}) {
  return (
    <IssueSourceFields
      orgId={orgId}
      value={{ sourceId: draft.sourceId, branch: draft.branch }}
      onChange={(next) =>
        onDraftChange({
          ...draft,
          sourceId: next.sourceId,
          branch: next.branch,
        })
      }
      onCreateBranch={(input) => {
        onDraftChange({ ...draft, branch: input.branch });
        if (input.createWorktree && draft.sourceId) {
          void createWorktreeForBranch({
            orgId,
            sourceId: draft.sourceId,
            branch: input.branch,
            createBranch: false,
          });
        }
      }}
    />
  );
}
