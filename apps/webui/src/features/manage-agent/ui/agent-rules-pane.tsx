import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BanIcon, CheckIcon, GlobeIcon, LaptopIcon, PlusIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import {
  createPermissionRule,
  type PermissionRulePublic,
  permissionRulesQuery,
  permissionRulesQueryKey,
  revokePermissionRule,
} from '@/entities/permission-rule/api/permission-rule';
import { fleetNodesQuery } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { RowList } from '@/shared/ui/capability-rows';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { toast } from '@/shared/ui/toast';

type RuleKind = 'fs-path' | 'shell-cmd';
type RuleEffect = 'allow' | 'deny';
type RuleScope = 'agent' | 'org';
type RuleAction = 'read' | 'edit';

interface AgentRulesPaneProps {
  orgId: string;
  agentId: string | null;
}

export function AgentRulesPane({ orgId, agentId }: AgentRulesPaneProps) {
  const queryClient = useQueryClient();
  const { data: nodes = [] } = useQuery(fleetNodesQuery);
  const nodeNames = Object.fromEntries(nodes.map((node) => [node.id, node.name]));
  const rulesQuery = useQuery(permissionRulesQuery(orgId));
  const rules = rulesQuery.data?.items ?? [];
  const visible = rules.filter(
    (rule) => rule.agentId === null || (agentId !== null && rule.agentId === agentId),
  );
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<RuleKind>('fs-path');
  const [pattern, setPattern] = useState('');
  const [action, setAction] = useState<RuleAction>('read');
  const [effect, setEffect] = useState<RuleEffect>('allow');
  const [scope, setScope] = useState<RuleScope>('agent');

  function invalidate(): Promise<void> {
    return queryClient.invalidateQueries({
      queryKey: [...permissionRulesQueryKey, orgId],
    });
  }

  const createMutation = useMutation({
    mutationFn: () => {
      if (kind === 'fs-path') {
        return createPermissionRule(orgId, {
          agentId: scope === 'org' ? null : agentId,
          kind,
          pattern: pattern.trim(),
          action,
          effect,
        });
      }
      return createPermissionRule(orgId, {
        agentId,
        kind,
        pattern: pattern.trim(),
        effect,
      });
    },
    onSuccess: () => {
      setPattern('');
      setAdding(false);
      void invalidate();
      toast.add({ title: 'Rule added' });
    },
    onError: (error) => {
      toast.add({ title: 'Could not add rule', description: String(error) });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (ruleId: string) => revokePermissionRule(orgId, ruleId),
    onSuccess: () => void invalidate(),
    onError: (error) => {
      toast.add({ title: 'Could not delete rule', description: String(error) });
    },
  });

  const fileGroups = fileRuleGroupsOf(visible, nodeNames);
  const shellRows = visible.filter((rule) => rule.kind === 'shell-cmd');
  const opRows =
    agentId === null
      ? []
      : visible.filter((rule) => rule.kind === 'op' && rule.agentId === agentId);

  function submit() {
    if (pattern.trim() === '') {
      return;
    }
    createMutation.mutate();
  }

  return (
    <div className="flex flex-col gap-3" data-testid="agent-rules-pane">
      <RowList>
        <SectionTitle>File paths</SectionTitle>
        {fileGroups.length === 0 ? (
          <EmptyRow text="No file rules. The run's working directory is accessible by default." />
        ) : (
          fileGroups.map((group) => (
            <RuleTableRow
              key={group.key}
              group={group}
              onDelete={() => {
                for (const entry of group.actions) {
                  revokeMutation.mutate(entry.id);
                }
              }}
            />
          ))
        )}
        <SectionTitle>Shell commands</SectionTitle>
        {shellRows.length === 0 ? (
          <EmptyRow text="No shell command rules." />
        ) : (
          shellRows.map((rule) => (
            <ShellRuleRow
              key={rule.id}
              pattern={rule.pattern}
              effect={rule.effect}
              onRevoke={() => revokeMutation.mutate(rule.id)}
            />
          ))
        )}
        <SectionTitle>Operations</SectionTitle>
        {agentId === null || opRows.length === 0 ? (
          <EmptyRow
            text={
              agentId === null
                ? 'Save the agent to see its always-allowed operations.'
                : 'No always-allowed operations.'
            }
          />
        ) : (
          opRows.map((rule) => (
            <div
              key={rule.id}
              className="group/row flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40"
              data-testid="rule-op-row"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] leading-5">
                {rule.pattern}
              </span>
              <span className="shrink-0 text-muted-foreground text-xs">
                {rule.decidedBy ?? 'user'} · {new Date(rule.createdAt).toLocaleDateString()}
              </span>
              <DeleteButton
                label={`Revoke ${rule.pattern}`}
                onRevoke={() => revokeMutation.mutate(rule.id)}
              />
            </div>
          ))
        )}
      </RowList>
      {adding ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2">
          <Select value={kind} onValueChange={(value) => setKind(value as RuleKind)}>
            <SelectTrigger className="h-8 w-32" aria-label="Rule kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fs-path">File path</SelectItem>
              <SelectItem value="shell-cmd">Shell command</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={pattern}
            onChange={(event) => setPattern(event.target.value)}
            placeholder={kind === 'fs-path' ? '/absolute/path/**' : 'git status'}
            className="h-8 min-w-40 flex-1 font-mono text-xs"
            aria-label="Rule pattern"
            autoFocus
          />
          {kind === 'fs-path' ? (
            <Select value={action} onValueChange={(value) => setAction(value as RuleAction)}>
              <SelectTrigger className="h-8 w-24" aria-label="Rule action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="edit">Edit</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
          <Select value={effect} onValueChange={(value) => setEffect(value as RuleEffect)}>
            <SelectTrigger className="h-8 w-24" aria-label="Rule effect">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="allow">Allow</SelectItem>
              <SelectItem value="deny">Deny</SelectItem>
            </SelectContent>
          </Select>
          {kind === 'fs-path' ? (
            <Select value={scope} onValueChange={(value) => setScope(value as RuleScope)}>
              <SelectTrigger className="h-8 w-24" aria-label="Rule scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agent">Agent</SelectItem>
                <SelectItem value="org">Org</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
          <div className="ml-auto flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={createMutation.isPending}
              className="h-8 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setAdding(false);
                setPattern('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pattern.trim() === '' || createMutation.isPending}
              onClick={submit}
            >
              Add rule
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-fit text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => {
            setAdding(true);
          }}
        >
          <PlusIcon /> Add rule
        </Button>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <p className="px-1 pt-2 font-medium text-[10px] text-muted-foreground uppercase tracking-wide first:pt-0">
      {children}
    </p>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="px-1 py-1 text-muted-foreground text-sm">{text}</p>;
}

function DeleteButton({ label, onRevoke }: { label: string; onRevoke: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onRevoke}
      className="mx-auto flex size-6 shrink-0 items-center justify-center rounded-sm opacity-0 transition-opacity hover:bg-muted group-hover/row:opacity-100"
    >
      <XIcon className="size-3.5 text-muted-foreground" />
    </button>
  );
}

function ShellRuleRow({
  pattern,
  effect,
  onRevoke,
}: {
  pattern: string;
  effect: RuleEffect;
  onRevoke: () => void;
}) {
  return (
    <div
      className="group/row flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40"
      data-testid="rule-shell-row"
    >
      {effect === 'allow' ? (
        <CheckIcon className="size-3.5 shrink-0 text-status-ok" />
      ) : (
        <BanIcon className="size-3.5 shrink-0 text-destructive" />
      )}
      <span className="min-w-0 flex-1 truncate font-mono text-[12px] leading-5">{pattern}</span>
      <DeleteButton label={`Delete rule ${pattern}`} onRevoke={onRevoke} />
    </div>
  );
}

interface RuleGroup {
  key: string;
  pattern: string;
  hostId: string | null;
  hostLabel: string;
  agentId: string | null;
  actions: { id: string; action: RuleAction; effect: RuleEffect }[];
}

function fileRuleGroupsOf(
  rules: PermissionRulePublic[],
  nodeNames: Record<string, string>,
): RuleGroup[] {
  const groups = new Map<string, RuleGroup>();
  for (const rule of rules) {
    if (rule.kind !== 'fs-path') {
      continue;
    }
    const key = `${rule.agentId ?? ''}|${rule.hostId ?? ''}|${rule.pattern}`;
    const existing = groups.get(key);
    if (existing) {
      existing.actions.push({ id: rule.id, action: rule.action ?? 'read', effect: rule.effect });
      continue;
    }
    groups.set(key, {
      key,
      pattern: rule.pattern,
      hostId: rule.hostId,
      hostLabel: rule.hostId === null ? 'any host' : (nodeNames[rule.hostId] ?? rule.hostId),
      agentId: rule.agentId,
      actions: [{ id: rule.id, action: rule.action ?? 'read', effect: rule.effect }],
    });
  }
  return [...groups.values()];
}

const TABLE_GRID =
  'grid grid-cols-[minmax(140px,200px)_minmax(160px,1fr)_56px_56px_44px] items-center gap-3';

function RuleTableRow({ group, onDelete }: { group: RuleGroup; onDelete: () => void }) {
  const stateOf = (action: RuleAction): RuleEffect | 'none' => {
    const entry = group.actions.find((item) => item.action === action);
    return entry?.effect ?? 'none';
  };
  return (
    <div className="group/row rounded-md px-2 py-1.5 transition-colors hover:bg-muted/40">
      <div className={TABLE_GRID}>
        <span className="flex shrink-0 items-center gap-1.5" title={group.hostLabel}>
          {group.hostId === null ? (
            <GlobeIcon className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <LaptopIcon className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-muted-foreground text-xs">{group.hostLabel}</span>
        </span>
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            dir="rtl"
            className="min-w-0 truncate text-left"
            title={`${group.pattern}${group.agentId === null ? ' · organization-wide' : ''}`}
          >
            <span className="block font-mono text-[12px] leading-5">{group.pattern}</span>
          </span>
          {group.agentId === null ? (
            <span className="shrink-0 rounded bg-muted px-1 font-mono text-[9px] text-muted-foreground leading-4">
              org
            </span>
          ) : null}
        </div>
        <div className="flex justify-center" title={stateTitle('read', stateOf('read'))}>
          <AccessCell state={stateOf('read')} />
        </div>
        <div className="flex justify-center" title={stateTitle('edit', stateOf('edit'))}>
          <AccessCell state={stateOf('edit')} />
        </div>
        <DeleteButton label={`Delete rules for ${group.pattern}`} onRevoke={onDelete} />
      </div>
    </div>
  );
}

function AccessCell({ state }: { state: RuleEffect | 'none' }) {
  if (state === 'allow') {
    return <CheckIcon className="size-3.5 text-status-ok" />;
  }
  if (state === 'deny') {
    return <BanIcon className="size-3.5 text-destructive" />;
  }
  return <span className="text-muted-foreground/50 text-xs">–</span>;
}

function stateTitle(action: RuleAction, state: RuleEffect | 'none'): string {
  if (state === 'allow') {
    return `${action} allowed`;
  }
  if (state === 'deny') {
    return `${action} denied`;
  }
  return `${action} not configured`;
}
