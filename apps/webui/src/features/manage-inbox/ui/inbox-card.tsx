import type { ApprovalDecisionScope, ApprovalOption, ApprovalRule } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import {
  BrainIcon,
  CheckIcon,
  CoinsIcon,
  FileIcon,
  MessageCircleQuestionIcon,
  PlayIcon,
  RepeatIcon,
  TerminalIcon,
  WrenchIcon,
  XIcon,
} from 'lucide-react';
import { useState } from 'react';
import {
  ApprovalButtons,
  DelegateBadge,
  defaultShellScope,
  type InboxApprovalRecord,
  kindLabel,
  ruleOf,
  ShellCommandBlock,
  shellCommandOf,
  shellScopeOptions,
} from '@/entities/approval';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { orgScopedAgentsQuery } from '@/shared/api/agents';
import { useOrgId } from '@/shared/config/location';
import { formatDayTime } from '@/shared/lib/format-clock';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { useInboxDecide } from '../model/use-inbox';
import { FileInboxCard } from './file-inbox-card';
import { AgeBadge, NoDeadlineNote, StaleWarning, StatusBadge } from './inbox-card-badges';
import { InboxStopRunButton } from './inbox-stop-run-button';
import { SpendInboxCard } from './spend-inbox-card';

const ONE_HOUR_MS = 60 * 60 * 1000;

const DECISION_BUTTONS: {
  option: ApprovalOption;
  scope?: ApprovalDecisionScope;
  label: string;
  icon: typeof CheckIcon;
}[] = [
  { option: 'approve', label: 'Approve', icon: CheckIcon },
  { option: 'approve_once', label: 'Once', icon: PlayIcon },
  { option: 'approve', scope: 'run', label: 'This run', icon: RepeatIcon },
  { option: 'deny', label: 'Deny', icon: XIcon },
];

const KIND_ICONS = {
  tool: WrenchIcon,
  spend: CoinsIcon,
  memory: BrainIcon,
  question: MessageCircleQuestionIcon,
  file_access: FileIcon,
} as const;

function isOldPendingAction(approval: InboxApprovalRecord): boolean {
  if (approval.status !== 'pending') {
    return false;
  }
  if (approval.kind !== 'tool' && approval.kind !== 'spend') {
    return false;
  }
  return Date.now() - Date.parse(approval.createdAt) >= ONE_HOUR_MS;
}

export function InboxCard({ approval }: { approval: InboxApprovalRecord }) {
  const orgId = useOrgId() ?? '';
  const timeZone = useOrgTimeZone();
  const { data: agents } = useQuery(orgScopedAgentsQuery(orgId));
  const decide = useInboxDecide();
  const [note, setNote] = useState('');
  const agentName = agents?.items.find((agent) => agent.id === approval.agentId)?.name;
  const pending = approval.status === 'pending';
  const staleAction = isOldPendingAction(approval);
  const tool = approval.context.tool;
  const KindIcon = KIND_ICONS[approval.kind];
  const decideWith = (
    decision: ApprovalOption,
    rule?: ApprovalRule,
    extend?: number,
    scope?: ApprovalDecisionScope,
  ) => {
    decide.mutate({
      approval,
      body: {
        decision,
        surface: 'web',
        ...(note.trim() === '' ? {} : { note: note.trim() }),
        ...(rule === undefined ? {} : { rule }),
        ...(extend === undefined ? {} : { extend }),
        ...(scope === undefined ? {} : { scope }),
      },
    });
    setNote('');
  };
  if (tool?.name === 'shell') {
    return (
      <ShellInboxCard
        approval={approval}
        agentName={agentName}
        pending={pending}
        staleAction={staleAction}
        note={note}
        setNote={setNote}
        busy={decide.isPending}
        onDecide={decideWith}
      />
    );
  }
  if (approval.kind === 'file_access' && approval.context.file) {
    return (
      <FileInboxCard
        approval={approval}
        file={approval.context.file}
        agentName={agentName}
        pending={pending}
        note={note}
        setNote={setNote}
        busy={decide.isPending}
        onDecide={decideWith}
      />
    );
  }
  if (approval.kind === 'spend') {
    return (
      <SpendInboxCard
        approval={approval}
        agentName={agentName}
        pending={pending}
        staleAction={staleAction}
        note={note}
        setNote={setNote}
        busy={decide.isPending}
        onDecide={decideWith}
      />
    );
  }
  return (
    <article className="flex flex-col gap-3 rounded-lg border bg-card p-4" data-testid="inbox-card">
      <header className="flex items-center gap-2">
        <Badge variant="secondary">
          <KindIcon data-icon="inline-start" />
          {kindLabel(approval.kind)}
        </Badge>
        <span className="min-w-0 truncate text-muted-foreground text-xs">
          {agentName ?? `${approval.agentId.slice(0, 8)}…`}
        </span>
        {pending ? (
          <AgeBadge createdAt={approval.createdAt} />
        ) : (
          <StatusBadge status={approval.status} />
        )}
      </header>
      <p className="text-sm leading-snug">{approval.question}</p>
      <DelegateBadge delegated={approval.context.delegated} />
      {tool ? (
        <div className="flex min-w-0 items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
          <TerminalIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="shrink-0 font-mono text-xs">{tool.name}</span>
          {tool.inputPreview ? (
            <span className="min-w-0 truncate font-mono text-muted-foreground text-xs">
              {tool.inputPreview}
            </span>
          ) : null}
        </div>
      ) : null}
      {staleAction ? <StaleWarning /> : null}
      {pending ? <NoDeadlineNote /> : null}
      {pending ? (
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
            {DECISION_BUTTONS.filter((button) => approval.options.includes(button.option)).map(
              (button) => (
                <Button
                  key={
                    button.scope === undefined ? button.option : `${button.option}-${button.scope}`
                  }
                  variant={
                    button.option === 'approve' && button.scope === undefined
                      ? 'default'
                      : 'outline'
                  }
                  size="sm"
                  className={button.option === 'deny' ? 'text-destructive' : undefined}
                  disabled={decide.isPending}
                  onClick={() => {
                    decideWith(button.option, undefined, undefined, button.scope);
                  }}
                  data-testid={`inbox-${button.option}${button.scope ? `-${button.scope}` : ''}`}
                >
                  <button.icon data-icon="inline-start" />
                  {button.label}
                </Button>
              ),
            )}
          </div>
        </div>
      ) : (
        <p className="border-t pt-3 text-muted-foreground text-xs">
          via {approval.decidedBy ?? 'system'}
          {approval.decidedAt ? ` · ${formatDayTime(approval.decidedAt, timeZone)}` : ''}
        </p>
      )}
    </article>
  );
}

function ShellInboxCard({
  approval,
  agentName,
  pending,
  staleAction,
  note,
  setNote,
  busy,
  onDecide,
}: {
  approval: InboxApprovalRecord;
  agentName: string | undefined;
  pending: boolean;
  staleAction: boolean;
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
  const contextTool = approval.context.tool;
  const view = shellCommandOf(
    contextTool?.command !== undefined ? { command: contextTool.command } : undefined,
    contextTool?.inputPreview,
  );
  const selected = defaultShellScope(shellScopeOptions(view.command));
  const canOnce = approval.options.includes('approve_once');
  const canRule = approval.options.includes('approve');
  const canDeny = approval.options.includes('deny');
  const truncated = contextTool?.truncated === true && contextTool.command === undefined;
  return (
    <article className="flex flex-col gap-3 rounded-lg border bg-card p-4" data-testid="inbox-card">
      <header className="flex items-center gap-2">
        <Badge variant="secondary">
          <TerminalIcon data-icon="inline-start" />
          Shell
        </Badge>
        <span className="min-w-0 truncate text-muted-foreground text-xs">
          {agentName ?? `${approval.agentId.slice(0, 8)}…`}
        </span>
        {pending ? (
          <AgeBadge createdAt={approval.createdAt} />
        ) : (
          <StatusBadge status={approval.status} />
        )}
      </header>
      <p className="text-sm leading-snug">{approval.question}</p>
      <DelegateBadge delegated={approval.context.delegated} />
      <ShellCommandBlock view={view} />
      {staleAction ? <StaleWarning /> : null}
      {pending ? (
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
              onDeny={canDeny ? () => onDecide('deny') : undefined}
              onAllowOnce={
                canOnce
                  ? () => {
                      onDecide('approve_once');
                    }
                  : undefined
              }
              onAllowRun={
                canRule
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
              alwaysAllowDisabled={!canRule || truncated || selected === null}
              alwaysAllowReason={truncated ? 'Command preview is truncated' : undefined}
            />
          </div>
        </div>
      ) : (
        <p className="border-t pt-3 text-muted-foreground text-xs">
          via {approval.decidedBy ?? 'system'}
          {approval.decidedAt ? ` · ${formatDayTime(approval.decidedAt, timeZone)}` : ''}
        </p>
      )}
    </article>
  );
}
