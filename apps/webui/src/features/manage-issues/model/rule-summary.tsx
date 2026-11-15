import type {
  BoardRule,
  BoardStatus,
  RuleAction,
  RuleCondition,
  RuleTrigger,
} from '@harnesys/contracts';
import type { IssueLabelRecord } from '@harnesys/studio-shared';
import type { ReactNode } from 'react';
import type { Agent } from '@/entities/agent';
import { ISSUE_PRIORITY_META, ISSUE_TYPE_LABELS } from './issue-meta';

export interface RuleSummaryInput {
  rule: BoardRule;
  agents: Agent[];
  statuses: BoardStatus[];
  labels: IssueLabelRecord[];
  showTrigger: boolean;
}

function Value({ children }: { children: ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

function joinNodes(nodes: ReactNode[], separator: string): ReactNode[] {
  const out: ReactNode[] = [];
  nodes.forEach((node, index) => {
    if (index > 0) {
      out.push(<Muted key={`sep-${index}`}>{separator}</Muted>);
    }
    out.push(node);
  });
  return out;
}

function labelTitle(labelId: string, labels: IssueLabelRecord[]): string {
  return labels.find((label) => label.id === labelId)?.title ?? 'label';
}

function statusTitle(statusKey: string, statuses: BoardStatus[]): string {
  return statuses.find((status) => status.key === statusKey)?.label ?? statusKey;
}

function agentName(agentId: string, agents: Agent[]): string {
  return agents.find((agent) => agent.id === agentId)?.name ?? 'agent';
}

function describeTrigger(trigger: RuleTrigger, statuses: BoardStatus[]): ReactNode {
  if (trigger.type === 'issue_created') {
    return <>When created</>;
  }
  return (
    <>
      When entering <Value>{statusTitle(trigger.statusKey, statuses)}</Value>
    </>
  );
}

export function describeCondition(condition: RuleCondition, labels: IssueLabelRecord[]): ReactNode {
  switch (condition.type) {
    case 'has_label':
      return (
        <>
          Label is <Value>{labelTitle(condition.labelId, labels)}</Value>
        </>
      );
    case 'has_not_label':
      return (
        <>
          Label isn&apos;t <Value>{labelTitle(condition.labelId, labels)}</Value>
        </>
      );
    case 'has_priority':
      return (
        <>
          Priority is <Value>{ISSUE_PRIORITY_META[condition.priority]?.label ?? 'Medium'}</Value>
        </>
      );
    case 'has_type':
      return (
        <>
          Type is <Value>{ISSUE_TYPE_LABELS[condition.issueType]}</Value>
        </>
      );
    case 'has_open_blockers':
      return <>{condition.value ? 'Has open blockers' : 'No open blockers'}</>;
    default:
      return null;
  }
}

export function describeAction(
  action: RuleAction,
  agents: Agent[],
  statuses: BoardStatus[],
  labels: IssueLabelRecord[],
): ReactNode {
  switch (action.type) {
    case 'assign_agent':
      return (
        <>
          Assign to <Value>{agentName(action.agentId, agents)}</Value>
        </>
      );
    case 'set_status':
      return (
        <>
          Move to <Value>{statusTitle(action.statusKey, statuses)}</Value>
        </>
      );
    case 'add_label':
      return (
        <>
          Add label <Value>{labelTitle(action.labelId, labels)}</Value>
        </>
      );
    case 'remove_label':
      return (
        <>
          Remove label <Value>{labelTitle(action.labelId, labels)}</Value>
        </>
      );
    case 'unassign':
      return <>Clear assignee</>;
    case 'notify_owner':
      return <>Notify owner</>;
    case 'stop':
      return <>Stop here</>;
    default:
      return null;
  }
}

export function ruleSummary(input: RuleSummaryInput): ReactNode {
  const { rule, agents, statuses, labels, showTrigger } = input;
  const parts: ReactNode[] = [];
  if (showTrigger) {
    parts.push(<span key="trigger">{describeTrigger(rule.trigger, statuses)}</span>);
  }
  if (rule.conditions.length > 0) {
    parts.push(
      <span key="conditions">
        {showTrigger ? <Muted> and </Muted> : null}
        <Muted>if </Muted>
        {joinNodes(
          rule.conditions.map((condition, index) => (
            <span key={`condition-${index}`}>{describeCondition(condition, labels)}</span>
          )),
          ' and ',
        )}
      </span>,
    );
  }
  if ((showTrigger || rule.conditions.length > 0) && rule.actions.length > 0) {
    parts.push(<Muted key="arrow">{' → '}</Muted>);
  }
  parts.push(
    ...joinNodes(
      rule.actions.map((action, index) => (
        <span key={`action-${index}`}>{describeAction(action, agents, statuses, labels)}</span>
      )),
      ', ',
    ),
  );
  return parts;
}
