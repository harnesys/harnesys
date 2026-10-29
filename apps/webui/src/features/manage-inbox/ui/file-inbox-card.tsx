import type {
  ApprovalDecisionScope,
  ApprovalOption,
  ApprovalRule,
  FileApprovalContext,
} from '@harnesys/contracts';
import { FileIcon } from 'lucide-react';
import { useState } from 'react';
import {
  ApprovalButtons,
  DelegateBadge,
  defaultFileScope,
  FileBlockCheckbox,
  FileScopeCrumbs,
  type FileScopeOption,
  type InboxApprovalRecord,
  kindLabel,
  RememberPanel,
  ruleOf,
} from '@/entities/approval';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { formatDayTime } from '@/shared/lib/format-clock';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
import { AgeBadge, StatusBadge } from './inbox-card-badges';
import { InboxStopRunButton } from './inbox-stop-run-button';

export function FileInboxCard({
  approval,
  file,
  agentName,
  pending,
  note,
  setNote,
  busy,
  onDecide,
}: {
  approval: InboxApprovalRecord;
  file: FileApprovalContext;
  agentName: string | undefined;
  pending: boolean;
  note: string;
  setNote: (value: string) => void;
  busy: boolean;
  onDecide: (
    decision: ApprovalOption,
    rule?: ApprovalRule,
    extend?: number,
    scope?: ApprovalDecisionScope,
  ) => void;
}) {
  const timeZone = useOrgTimeZone();
  const [blockPath, setBlockPath] = useState(false);
  const [choice, setChoice] = useState<FileScopeOption | null>(null);
  const toolName = approval.context.tool?.name;
  const selected = choice ?? defaultFileScope(file.canonicalPath, toolName);
  const canOnce = approval.options.includes('approve_once');
  const canAllow = approval.options.includes('approve') && selected !== null;
  const canRun = approval.options.includes('approve');
  const canBlock = approval.options.includes('block_path');
  return (
    <article className="flex flex-col gap-3 rounded-lg border bg-card p-4" data-testid="inbox-card">
      <header className="flex items-center gap-2">
        <Badge variant="secondary">
          <FileIcon data-icon="inline-start" />
          {kindLabel(approval.kind)}
        </Badge>
        <span className="min-w-0 truncate text-muted-foreground text-xs">
          {agentName ?? `${approval.agentId.slice(0, 8)}...`}
        </span>
        {pending ? (
          <AgeBadge createdAt={approval.createdAt} />
        ) : (
          <StatusBadge status={approval.status} />
        )}
      </header>
      <p className="text-sm leading-snug">{approval.question}</p>
      <DelegateBadge delegated={approval.context.delegated} />
      <p className="truncate font-mono text-[11px] text-muted-foreground">
        {file.action === 'edit' ? 'Edit' : 'Read'} · {file.runtime} · {file.host}
      </p>
      {pending ? (
        <>
          <RememberPanel>
            <FileScopeCrumbs
              path={file.canonicalPath}
              toolName={toolName}
              selectedPattern={selected?.pattern ?? ''}
              onSelect={setChoice}
              disabled={busy}
            />
            <FileBlockCheckbox checked={blockPath} onChange={setBlockPath} disabled={busy} />
          </RememberPanel>
          <div className="flex items-center gap-2 border-t pt-3">
            <Input
              value={note}
              placeholder="Note (optional)"
              onChange={(event) => {
                setNote(event.target.value);
              }}
              className="h-8 min-w-0 flex-1 text-xs"
              data-testid="inbox-note"
            />
            <div className="flex shrink-0 items-center gap-1.5">
              <InboxStopRunButton approval={approval} />
              <ApprovalButtons
                busy={busy}
                onDeny={() => {
                  onDecide(blockPath && canBlock ? 'block_path' : 'deny');
                }}
                onAllowOnce={
                  canOnce
                    ? () => {
                        onDecide('approve_once');
                      }
                    : undefined
                }
                onAllowRun={
                  canRun
                    ? () => {
                        onDecide('approve', undefined, undefined, 'run');
                      }
                    : undefined
                }
                onAlwaysAllow={() => {
                  if (!selected) {
                    return;
                  }
                  onDecide('approve', ruleOf(selected, 'agent'));
                }}
                alwaysAllowDisabled={!canAllow}
              />
            </div>
          </div>
        </>
      ) : (
        <p className="border-t pt-3 text-muted-foreground text-xs">
          via {approval.decidedBy ?? 'system'}
          {approval.decidedAt ? ` · ${formatDayTime(approval.decidedAt, timeZone)}` : ''}
        </p>
      )}
    </article>
  );
}
