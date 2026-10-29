import type { FileRuleAction, FileRuleEffect } from '@harnesys/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BanIcon, CheckIcon, GlobeIcon, LaptopIcon, PlusIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import {
  createFileRule,
  deleteFileRule,
  type FileRulePublic,
  fileRulesQuery,
  fileRulesQueryKey,
} from '@/entities/file-rule/api/file-rule';
import { fleetNodesQuery } from '@/shared/api';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { RowList } from '@/shared/ui/capability-rows';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { toast } from '@/shared/ui/toast';

interface AgentRulesPaneProps {
  orgId: string;
  agentId: string | null;
}

type RuleAction = FileRuleAction;
type RuleEffect = FileRuleEffect;
type RuleScope = 'agent' | 'org';

export function AgentRulesPane({ orgId, agentId }: AgentRulesPaneProps) {
  const queryClient = useQueryClient();
  const rulesQuery = useQuery(fileRulesQuery(orgId));
  const { data: nodes = [] } = useQuery(fleetNodesQuery);
  const nodeNames = Object.fromEntries(nodes.map((node) => [node.id, node.name]));
  const [pathPattern, setPathPattern] = useState('');
  const [adding, setAdding] = useState(false);
  const [action, setAction] = useState<RuleAction>('read');
  const [effect, setEffect] = useState<RuleEffect>('allow');
  const [scope, setScope] = useState<RuleScope>('agent');

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: fileRulesQueryKey });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createFileRule(orgId, {
        agentId: scope === 'agent' ? agentId : null,
        pathPattern: pathPattern.trim(),
        action,
        effect,
      }),
    onSuccess: async () => {
      setPathPattern('');
      setAdding(false);
      await invalidate();
      toast.add({ title: 'File rule added' });
    },
    onError: (error) => {
      toast.add({ title: 'Could not add rule', description: String(error) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) => deleteFileRule(orgId, ruleId),
    onSuccess: async () => {
      await invalidate();
    },
    onError: (error) => {
      toast.add({ title: 'Could not delete rule', description: String(error) });
    },
  });

  const rules = rulesQuery.data?.items ?? [];
  const visible = rules.filter(
    (rule) => rule.agentId === null || (agentId !== null && rule.agentId === agentId),
  );
  const groups = groupRulesByPath(visible, nodeNames);
  const deleteRuleGroup = (group: RuleGroup) => {
    for (const entry of group.actions) {
      deleteMutation.mutate(entry.id);
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="agent-rules-pane">
      <RowList>
        {groups.length === 0 ? (
          <p className="px-1 py-2 text-muted-foreground text-sm">
            No rules yet. The run's working directory is accessible by default.
          </p>
        ) : null}
        {groups.length > 0 ? <RuleTableHeader /> : null}
        {groups.map((group) => (
          <RuleTableRow key={group.key} group={group} onDelete={() => deleteRuleGroup(group)} />
        ))}
      </RowList>
      {adding ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2">
          <Input
            value={pathPattern}
            onChange={(event) => setPathPattern(event.target.value)}
            placeholder="/absolute/path/**"
            className="h-8 min-w-48 flex-1 font-mono text-xs"
            aria-label="Rule path"
            autoFocus
          />
          <Select value={action} onValueChange={(value) => setAction(value as RuleAction)}>
            <SelectTrigger className="h-8 w-24" aria-label="Rule action">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="read">Read</SelectItem>
              <SelectItem value="edit">Edit</SelectItem>
            </SelectContent>
          </Select>
          <Select value={effect} onValueChange={(value) => setEffect(value as RuleEffect)}>
            <SelectTrigger className="h-8 w-24" aria-label="Rule effect">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="allow">Allow</SelectItem>
              <SelectItem value="deny">Deny</SelectItem>
            </SelectContent>
          </Select>
          <Select value={scope} onValueChange={(value) => setScope(value as RuleScope)}>
            <SelectTrigger className="h-8 w-24" aria-label="Rule scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="agent">Agent</SelectItem>
              <SelectItem value="org">Org</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={createMutation.isPending}
              className="h-8 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setAdding(false);
                setPathPattern('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!pathPattern.trim() || createMutation.isPending}
              onClick={() => {
                createMutation.mutate();
              }}
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

interface RuleGroup {
  key: string;
  pattern: string;
  hostId: string | null;
  hostLabel: string;
  agentId: string | null;
  actions: { id: string; action: RuleAction; effect: RuleEffect }[];
}

function groupRulesByPath(rules: FileRulePublic[], nodeNames: Record<string, string>): RuleGroup[] {
  const groups = new Map<string, RuleGroup>();
  for (const rule of rules) {
    const key = `${rule.agentId ?? ''}|${rule.hostId ?? ''}|${rule.pathPattern}`;
    const existing = groups.get(key);
    if (existing) {
      existing.actions.push({ id: rule.id, action: rule.action, effect: rule.effect });
      continue;
    }
    groups.set(key, {
      key,
      pattern: rule.pathPattern,
      hostId: rule.hostId,
      hostLabel: rule.hostId === null ? 'any host' : (nodeNames[rule.hostId] ?? rule.hostId),
      agentId: rule.agentId,
      actions: [{ id: rule.id, action: rule.action, effect: rule.effect }],
    });
  }
  return [...groups.values()];
}

const TABLE_GRID =
  'grid grid-cols-[minmax(140px,200px)_minmax(160px,1fr)_56px_56px_44px] items-center gap-3';

function RuleTableHeader() {
  return (
    <div className={cn(TABLE_GRID, 'py-1 pl-1 font-medium text-[10px] text-muted-foreground')}>
      <span>Host</span>
      <span>Path</span>
      <span className="text-center">Read</span>
      <span className="text-center">Edit</span>
      <span />
    </div>
  );
}

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
        <div className="flex justify-center" title={accessTitleFor('read', stateOf('read'))}>
          <AccessCell state={stateOf('read')} />
        </div>
        <div className="flex justify-center" title={accessTitleFor('edit', stateOf('edit'))}>
          <AccessCell state={stateOf('edit')} />
        </div>
        <button
          type="button"
          aria-label={`Delete rules for ${group.pattern}`}
          onClick={onDelete}
          className="mx-auto flex size-6 items-center justify-center rounded-sm opacity-0 transition-opacity hover:bg-muted group-hover/row:opacity-100"
        >
          <XIcon className="size-3.5 text-muted-foreground" />
        </button>
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

function accessTitleFor(action: RuleAction, state: RuleEffect | 'none'): string {
  if (state === 'allow') {
    return `${action} allowed`;
  }
  if (state === 'deny') {
    return `${action} denied`;
  }
  return `${action} not configured`;
}
