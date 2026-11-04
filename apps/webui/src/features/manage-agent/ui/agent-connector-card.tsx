import {
  CONNECTOR_CATALOG,
  type ConnectorPublic,
  type ConnectorStatus,
  type MirrorPolicyPublic,
} from '@harnesys/contracts';
import { ConnectorMark } from '@/features/manage-connectors/ui/connector-icon';
import { Button } from '@/shared/ui/button';
import { RowChip } from '@/shared/ui/capability-rows';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { ConnectorAgentSet } from './agent-connector-agent-set';
import { ConnectorBindings } from './agent-connector-bindings';
import { AgentConnectorPolicy } from './agent-connector-policy';

export interface PairInfo {
  pairCode: string;
  pairUrl: string;
}

const STATUS_LABEL: Record<ConnectorStatus, string> = {
  awaiting_pair: 'Awaiting pair',
  active: 'Active',
  paused: 'Paused',
  error: 'Error',
};

const STATUS_TONE: Record<ConnectorStatus, 'ok' | 'warn' | 'info' | 'danger'> = {
  active: 'ok',
  paused: 'warn',
  awaiting_pair: 'info',
  error: 'danger',
};

const TELEGRAM_DESCRIPTOR =
  CONNECTOR_CATALOG.find((item) => item.id === 'telegram') ?? CONNECTOR_CATALOG[0];

export function TelegramConnectorCard({
  orgId,
  connector,
  token,
  pairInfo,
  busy,
  canSave,
  onTokenChange,
  onSave,
  onGenerateLink,
  onPause,
  onResume,
  onUnpair,
  onRemove,
  onAddAgent,
  onRemoveAgent,
  onConnect,
  onDisconnect,
  onOpenThread,
  onPolicyChange,
}: {
  orgId: string;
  connector: ConnectorPublic | null;
  token: string;
  pairInfo: PairInfo | null;
  busy: boolean;
  canSave: boolean;
  onTokenChange: (value: string) => void;
  onSave: () => void;
  onGenerateLink: () => void;
  onPause: () => void;
  onResume: () => void;
  onUnpair: () => void;
  onRemove: () => void;
  onAddAgent: (agentId: string) => void;
  onRemoveAgent: (agentId: string) => void;
  onConnect: (bindingId: string, autoReplyAgentId: string | null) => void;
  onDisconnect: (bindingId: string) => void;
  onOpenThread: (threadId: string) => void;
  onPolicyChange: (policy: MirrorPolicyPublic) => void;
}) {
  const status = connector?.status ?? null;

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border bg-popover p-3"
      data-testid="agent-connector-telegram"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ConnectorMark connector={TELEGRAM_DESCRIPTOR} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-sm leading-5">Telegram</p>
            <p className="truncate font-mono text-[11px] text-muted-foreground leading-4">
              {connector?.botUsername ? `@${connector.botUsername}` : 'Not linked'}
            </p>
          </div>
        </div>
        <RowChip
          tone={status ? STATUS_TONE[status] : 'neutral'}
          testId="agent-connector-telegram-status"
        >
          {status ? STATUS_LABEL[status] : 'Not connected'}
        </RowChip>
      </div>

      {connector?.lastError ? (
        <p className="text-destructive text-xs" data-testid="agent-connector-last-error">
          {connector.lastError}
        </p>
      ) : null}

      {connector?.capabilityWarning ? (
        <p className="text-status-warn text-xs" data-testid="agent-connector-capability-warning">
          {connector.capabilityWarning}
        </p>
      ) : null}

      <Field className="gap-1.5">
        <FieldLabel htmlFor="connector-bot-token">Bot token</FieldLabel>
        <div className="flex gap-2">
          <Input
            id="connector-bot-token"
            type="password"
            autoComplete="off"
            className="font-mono"
            placeholder={connector ? '••••••••' : '123456:ABC…'}
            value={token}
            disabled={busy}
            onChange={(event) => onTokenChange(event.target.value)}
          />
          <Button type="button" size="sm" disabled={!canSave} onClick={onSave}>
            Save
          </Button>
        </div>
      </Field>

      {connector ? (
        <>
          <ConnectorAgentSet
            orgId={orgId}
            agents={connector.agents}
            disabled={busy}
            onAdd={onAddAgent}
            onRemove={onRemoveAgent}
          />
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Chats</p>
            <ConnectorBindings
              bindings={connector.bindings}
              capabilities={connector.capabilities}
              agents={connector.agents}
              disabled={busy}
              onConnect={onConnect}
              onDisconnect={onDisconnect}
              onOpenThread={onOpenThread}
            />
          </div>
          <PairSection pairInfo={pairInfo} busy={busy} onGenerateLink={onGenerateLink} />
          <div className="flex flex-wrap gap-2">
            {connector.status === 'paused' ? (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onResume}>
                Resume
              </Button>
            ) : (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onPause}>
                Pause
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onUnpair}>
              Unpair
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={onRemove}
            >
              Remove
            </Button>
          </div>
          <AgentConnectorPolicy
            policy={connector.policy}
            disabled={busy}
            onChange={onPolicyChange}
          />
        </>
      ) : null}
    </div>
  );
}

function PairSection({
  pairInfo,
  busy,
  onGenerateLink,
}: {
  pairInfo: PairInfo | null;
  busy: boolean;
  onGenerateLink: () => void;
}) {
  if (pairInfo) {
    return (
      <div className="flex flex-col gap-1 rounded-md border border-dashed px-2 py-2 text-xs">
        <a
          href={pairInfo.pairUrl}
          target="_blank"
          rel="noreferrer"
          className="truncate text-status-info underline-offset-2 hover:underline"
        >
          {pairInfo.pairUrl}
        </a>
        <p className="font-mono text-muted-foreground">{pairInfo.pairCode}</p>
      </div>
    );
  }
  return (
    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onGenerateLink}>
      Generate a new link
    </Button>
  );
}
