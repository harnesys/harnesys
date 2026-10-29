import type {
  ApprovalBudget,
  ApprovalBudgetKind,
  ApprovalOption,
  ApprovalRule,
} from '@harnesys/contracts';
import { CheckIcon, CoinsIcon, FlagIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import type { InboxApprovalRecord } from '@/entities/approval';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { formatDayTime } from '@/shared/lib/format-clock';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { NoDeadlineNote, StaleWarning } from './inbox-card-badges';
import { InboxStopRunButton } from './inbox-stop-run-button';

function budgetUnit(kind: ApprovalBudgetKind | undefined): string {
  if (kind === 'tokens') {
    return 'tokens';
  }
  if (kind === 'deadline') {
    return 'min';
  }
  return 'steps';
}

function defaultAmount(budget: ApprovalBudget | undefined): number {
  if (!budget) {
    return 1;
  }
  if (budget.kind === 'deadline') {
    return Math.max(1, Math.round(budget.defaultExtend / 60000));
  }
  return Math.max(1, budget.defaultExtend);
}

function extendAmount(kind: ApprovalBudgetKind, amount: number): number {
  return kind === 'deadline' ? amount * 60000 : Math.floor(amount);
}

export function SpendInboxCard({
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
  onDecide: (decision: ApprovalOption, rule?: ApprovalRule, extend?: number) => void;
}) {
  const timeZone = useOrgTimeZone();
  const budget = approval.context.budget;
  const unit = budgetUnit(budget?.kind);
  const [amount, setAmount] = useState(() => String(defaultAmount(budget)));
  const canClose = approval.options.includes('close');
  const canDeny = approval.options.includes('deny');
  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed >= 1;
  const extend = budget && valid ? extendAmount(budget.kind, parsed) : undefined;
  return (
    <article className="flex flex-col gap-3 rounded-lg border bg-card p-4" data-testid="inbox-card">
      <header className="flex items-center gap-2">
        <Badge variant="secondary">
          <CoinsIcon data-icon="inline-start" />
          Spend
        </Badge>
        <span className="min-w-0 truncate text-muted-foreground text-xs">
          {agentName ?? `${approval.agentId.slice(0, 8)}…`}
        </span>
        {pending ? (
          <span className="text-muted-foreground text-xs">{approval.createdAt}</span>
        ) : (
          <span className="text-muted-foreground text-xs">{approval.status}</span>
        )}
      </header>
      <p className="text-sm leading-snug">{approval.question}</p>
      {budget ? (
        <div className="flex min-w-0 items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
          <CoinsIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="shrink-0 text-xs">
            used {budget.used} of {budget.limit} {unit}
          </span>
        </div>
      ) : null}
      {staleAction ? <StaleWarning /> : null}
      {pending ? <NoDeadlineNote /> : null}
      {pending ? (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Input
            value={note}
            placeholder="Note (optional)"
            onChange={(event) => {
              setNote(event.target.value);
            }}
            className="h-8 min-w-0 flex-1 text-xs"
            data-testid="inbox-note"
          />
          {budget ? (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-xs">+</span>
              <Input
                value={amount}
                inputMode="numeric"
                onChange={(event) => {
                  setAmount(event.target.value);
                }}
                className="h-8 w-20 text-xs"
                data-testid="inbox-extend"
              />
              <span className="text-muted-foreground text-xs">{unit}</span>
            </div>
          ) : null}
          <div className="flex shrink-0 items-center gap-1.5">
            <InboxStopRunButton approval={approval} />
            <Button
              variant="default"
              size="sm"
              disabled={busy || (budget !== undefined && !valid)}
              onClick={() => {
                onDecide('approve', undefined, extend);
              }}
              data-testid="inbox-approve"
            >
              <CheckIcon data-icon="inline-start" />
              {budget ? `Approve +${amount}` : 'Approve'}
            </Button>
            {canClose ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  onDecide('close');
                }}
                data-testid="inbox-close"
              >
                <FlagIcon data-icon="inline-start" />
                Close now
              </Button>
            ) : null}
            {canDeny ? (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                disabled={busy}
                onClick={() => {
                  onDecide('deny');
                }}
                data-testid="inbox-deny"
              >
                <XIcon data-icon="inline-start" />
                Deny
              </Button>
            ) : null}
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
