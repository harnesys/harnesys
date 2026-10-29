import type {
  GetIssueResponse,
  IssuePlacementDiagnosis,
  RepositoryWorktree,
  UpdateIssueBody,
} from '@harnesys/contracts';
import type { BoardStatus, IssueRecord } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { GitBranchIcon } from 'lucide-react';
import { useState } from 'react';
import type { Agent } from '@/entities/agent';
import { AgentRecordAvatar } from '@/entities/agent';
import { executionProfilesQuery, updateIssueRecord } from '@/shared/api';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { toast } from '@/shared/ui/toast';
import { issueWorktreeBranchPreview } from '../../model/issue-branch';
import { errorMessage } from '../../model/issue-errors';
import { createWorktreeForBranch } from '../../model/issues';
import { IssueSourceFields } from './issue-source-fields';

export function IssueVcsPanel({
  orgId,
  issue,
  detail,
  agents,
  statuses,
  onChanged,
}: {
  orgId: string;
  issue: IssueRecord;
  detail: GetIssueResponse;
  agents: Agent[];
  statuses: BoardStatus[];
  onChanged: () => void;
}) {
  const { data: profiles } = useQuery(executionProfilesQuery(orgId));
  const worktreeRef = detail.issue.worktree;
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const executor =
    agents.find(
      (agent) => agent.id === (detail.execution?.agentId ?? detail.launchPreview.agentId),
    ) ?? null;
  const profileName =
    profiles?.items.find(
      (item) => item.id === (detail.execution?.profileId ?? detail.launchPreview.profileId),
    )?.name ?? '—';

  const patchIssue = async (body: UpdateIssueBody): Promise<boolean> => {
    setBusy(true);
    try {
      await updateIssueRecord(orgId, issue.id, body);
      onChanged();
      return true;
    } catch (error) {
      toast.add({ title: 'Update failed', description: errorMessage(error), type: 'error' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onCreateBranch = async (input: {
    branch: string;
    createWorktree: boolean;
  }): Promise<void> => {
    if (!issue.sourceId) {
      return;
    }
    const ok = await patchIssue({ branch: input.branch });
    if (!ok) {
      return;
    }
    if (input.createWorktree) {
      await createWorktreeForBranch({
        orgId,
        sourceId: issue.sourceId,
        branch: input.branch,
        createBranch: true,
      });
    }
    onChanged();
  };

  const createNow = async (): Promise<void> => {
    if (!issue.sourceId || !issue.branch) {
      return;
    }
    setCreating(true);
    const ok = await createWorktreeForBranch({
      orgId,
      sourceId: issue.sourceId,
      branch: issue.branch,
      createBranch: false,
    });
    setCreating(false);
    if (ok) {
      onChanged();
    }
  };

  return (
    <section className="space-y-3" data-testid="issue-vcs-panel">
      <div className="flex items-center gap-2">
        <GitBranchIcon className="size-4 text-muted-foreground" />
        <h3 className="font-medium text-sm">Source & worktree</h3>
      </div>

      <IssueSourceFields
        orgId={orgId}
        disabled={busy || worktreeRef != null}
        attachedBranch={worktreeRef?.branch ?? null}
        branchNameSeed={issueWorktreeBranchPreview(issue.id, issue.title)}
        busy={busy}
        creating={creating}
        worktree={worktreeRef}
        worktreeOnStatus={issue.worktreeOnStatus}
        statuses={statuses}
        value={{ sourceId: issue.sourceId ?? '', branch: issue.branch }}
        onChange={(next) => {
          void patchIssue({ sourceId: next.sourceId || null, branch: next.branch });
        }}
        onCreateBranch={(input) => {
          void onCreateBranch(input);
        }}
        onCreateWorktree={issue.branch ? () => void createNow() : undefined}
        onWorktreeOnStatusChange={(statusKey) => {
          void patchIssue({ worktreeOnStatus: statusKey });
        }}
      />
      {worktreeRef ? (
        <p className="text-[11px] text-muted-foreground">Read-only while a worktree is attached.</p>
      ) : null}

      <div className="space-y-1.5 rounded-md border px-3 py-2 text-xs">
        <Row label="Executor" value={executor?.name ?? '—'} mark={executor} />
        <Row
          label="Profile"
          value={`${profileName}${
            detail.launchPreview.profileSource ? ` · ${detail.launchPreview.profileSource}` : ''
          }`}
        />
        {detail.execution ? (
          <Row
            label="Run"
            value={`${detail.execution.state}${detail.execution.runId ? ` · ${detail.execution.runId.slice(0, 8)}` : ''}`}
          />
        ) : null}
        <WorktreeSummary worktree={detail.worktree} />
        {detail.placement ? (
          <PlacementBlock placement={detail.placement} />
        ) : (
          <p className="text-muted-foreground">
            Node is assigned by placement when a run starts — not stored on the issue.
          </p>
        )}
      </div>
    </section>
  );
}

function Row({ label, value, mark }: { label: string; value: string; mark?: Agent | null }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-right font-medium text-foreground">
        {mark ? <AgentRecordAvatar agent={mark} /> : null}
        <span className="truncate">{value}</span>
      </span>
    </div>
  );
}

function WorktreeSummary({ worktree }: { worktree: RepositoryWorktree | null }) {
  if (!worktree) {
    return <p className="text-muted-foreground">No worktree yet</p>;
  }
  return (
    <div className="space-y-0.5">
      <Row label="Branch" value={worktree.branch} />
      <Row label="Node" value={worktree.hostId.slice(0, 8)} />
      <Row
        label="State"
        value={`${worktree.state}${worktree.dirty ? ' · dirty' : ''}${worktree.unpushed ? ' · unpushed' : ''}`}
      />
    </div>
  );
}

function PlacementBlock({ placement }: { placement: IssuePlacementDiagnosis }) {
  return (
    <Collapsible>
      <div className="space-y-1">
        <Row label="Placement" value={placement.summary} />
        {placement.waiting ? (
          <p className="text-[11px] text-amber-600">Waiting for an eligible node</p>
        ) : null}
        {placement.selectedNodeId ? (
          <Row label="Selected node" value={placement.selectedNodeId.slice(0, 8)} />
        ) : null}
        <CollapsibleTrigger className="text-[11px] text-muted-foreground underline-offset-2 hover:underline">
          Placement diagnosis
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground">
            {placement.candidates.length === 0 ? (
              <li>No candidate details</li>
            ) : (
              placement.candidates.map((candidate) => (
                <li key={candidate.nodeId}>
                  {candidate.nodeId.slice(0, 8)} ·{' '}
                  {candidate.eligible ? 'eligible' : candidate.reasons.join(', ') || 'excluded'}
                </li>
              ))
            )}
          </ul>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
