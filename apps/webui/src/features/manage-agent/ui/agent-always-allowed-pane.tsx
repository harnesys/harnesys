import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { XIcon } from 'lucide-react';
import { useState } from 'react';
import {
  deleteFileRule,
  fileRulesQuery,
  fileRulesQueryKey,
} from '@/entities/file-rule/api/file-rule';
import {
  permissionGrantsQuery,
  permissionGrantsQueryKey,
  revokePermissionGrant,
} from '@/entities/permission-grant/api/permission-grant';
import { Button } from '@/shared/ui/button';
import { RowList } from '@/shared/ui/capability-rows';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { toast } from '@/shared/ui/toast';

interface AlwaysTab {
  op: string;
  label: string;
}

const ALWAYS_TABS: readonly AlwaysTab[] = [
  { op: 'fs.write', label: 'File writes' },
  { op: 'process', label: 'Shell' },
  { op: 'network', label: 'Network' },
  { op: 'mcp', label: 'MCP tools' },
  { op: 'agents', label: 'Create agents' },
];

interface AgentAlwaysAllowedPaneProps {
  orgId: string;
  agentId: string | null;
  shellAllowlist: readonly string[];
  onShellRevoke: (entry: string) => void;
}

export function AgentAlwaysAllowedPane({
  orgId,
  agentId,
  shellAllowlist,
  onShellRevoke,
}: AgentAlwaysAllowedPaneProps) {
  const [tab, setTab] = useState<string>('fs.write');
  return (
    <div className="flex flex-col gap-3" data-testid="agent-always-allowed-pane">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full">
          {ALWAYS_TABS.map((item) => (
            <TabsTrigger key={item.op} value={item.op} className="flex-1">
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {tab === 'fs.write' ? <FileRuleRows orgId={orgId} agentId={agentId} /> : null}
      {tab === 'process' ? <ShellRows allowlist={shellAllowlist} onRevoke={onShellRevoke} /> : null}
      {tab === 'network' || tab === 'mcp' || tab === 'agents' ? (
        <GrantRows orgId={orgId} agentId={agentId} operation={tab} />
      ) : null}
    </div>
  );
}

function EmptyRows({ hint }: { hint: string }) {
  return <p className="px-1 py-2 text-muted-foreground text-sm">{hint}</p>;
}

function RevokeButton({
  label,
  pending,
  onRevoke,
}: {
  label: string;
  pending: boolean;
  onRevoke: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
      disabled={pending}
      aria-label={label}
      title={label}
      onClick={onRevoke}
    >
      <XIcon />
    </Button>
  );
}

function FileRuleRows({ orgId, agentId }: { orgId: string; agentId: string | null }) {
  const queryClient = useQueryClient();
  const { data } = useQuery(fileRulesQuery(orgId));
  const remove = useMutation({
    mutationFn: (ruleId: string) => deleteFileRule(orgId, ruleId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: fileRulesQueryKey });
    },
    onError: (error) => {
      toast.add({ title: 'Could not revoke rule', description: String(error) });
    },
  });
  const rules = (data?.items ?? []).filter(
    (rule) => rule.effect === 'allow' && (rule.agentId === null || rule.agentId === agentId),
  );
  if (rules.length === 0) {
    return <EmptyRows hint="No always-allowed paths." />;
  }
  return (
    <RowList>
      {rules.map((rule) => (
        <div key={rule.id} className="flex items-center gap-2 py-1.5" data-testid="always-file-row">
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{rule.pathPattern}</span>
          <span className="shrink-0 text-muted-foreground text-xs">{rule.action}</span>
          <RevokeButton
            label="Revoke file rule"
            pending={remove.isPending}
            onRevoke={() => remove.mutate(rule.id)}
          />
        </div>
      ))}
    </RowList>
  );
}

function ShellRows({
  allowlist,
  onRevoke,
}: {
  allowlist: readonly string[];
  onRevoke: (entry: string) => void;
}) {
  if (allowlist.length === 0) {
    return <EmptyRows hint="No always-allowed commands. Managed in Capabilities → Shell." />;
  }
  return (
    <RowList>
      {allowlist.map((entry) => (
        <div key={entry} className="flex items-center gap-2 py-1.5" data-testid="always-shell-row">
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{entry}</span>
          <RevokeButton
            label={`Revoke ${entry}`}
            pending={false}
            onRevoke={() => onRevoke(entry)}
          />
        </div>
      ))}
    </RowList>
  );
}

function GrantRows({
  orgId,
  agentId,
  operation,
}: {
  orgId: string;
  agentId: string | null;
  operation: string;
}) {
  const queryClient = useQueryClient();
  const { data } = useQuery(permissionGrantsQuery(orgId, agentId));
  const remove = useMutation({
    mutationFn: (grantId: string) => revokePermissionGrant(orgId, grantId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: permissionGrantsQueryKey });
    },
    onError: (error) => {
      toast.add({ title: 'Could not revoke grant', description: String(error) });
    },
  });
  if (agentId === null) {
    return <EmptyRows hint="Save the agent to see its always-allowed grants." />;
  }
  const grants = (data?.items ?? []).filter((grant) => grant.operation === operation);
  if (grants.length === 0) {
    return <EmptyRows hint="Nothing is always allowed." />;
  }
  return (
    <RowList>
      {grants.map((grant) => (
        <div
          key={grant.id}
          className="flex items-center gap-2 py-1.5"
          data-testid="always-grant-row"
        >
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{grant.operation}</span>
          <span className="shrink-0 text-muted-foreground text-xs">
            {grant.decidedBy ?? 'user'} · {new Date(grant.createdAt).toLocaleDateString()}
          </span>
          <RevokeButton
            label="Revoke always-allowed grant"
            pending={remove.isPending}
            onRevoke={() => remove.mutate(grant.id)}
          />
        </div>
      ))}
    </RowList>
  );
}
