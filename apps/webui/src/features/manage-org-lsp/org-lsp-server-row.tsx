import type { OrgLspEntry } from '@harnesys/contracts';
import {
  CheckIcon,
  DownloadIcon,
  FileCode2Icon,
  PauseIcon,
  PlayIcon,
  PuzzleIcon,
  RotateCwIcon,
  Trash2Icon,
} from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Row, RowChip, RowField, RowSection } from '@/shared/ui/capability-rows';
import type { StatusDotTone } from '@/shared/ui/status-dot';

export type LspServerAction = 'restart' | 'stop' | 'enable';

interface OrgLspServerRowProps {
  server: OrgLspEntry;
  installCommand?: string;
  expanded: boolean;
  onToggle: (serverId: string) => void;
  busy: 'action' | 'install' | 'remove' | 'approve' | null;
  onAction: (serverId: string, action: LspServerAction) => void;
  onApprove: (input: { pluginName: string; serverId: string }) => void;
  onInstall: (serverId: string) => void;
  onRemove: (serverId: string) => void;
}

export function OrgLspServerRow({
  server,
  installCommand,
  expanded,
  onToggle,
  busy,
  onAction,
  onApprove,
  onInstall,
  onRemove,
}: OrgLspServerRowProps) {
  const status = statusOf(server);
  const problem = problemOf(server, installCommand);
  const needsApproval = !server.granted && server.origin !== 'file';
  const pluginName = server.origin.replace(/^plugin:/, '');
  const isFile = server.origin === 'file';
  return (
    <Row
      testId={`lsp-server-${server.serverId}`}
      title={server.serverId}
      muted={server.disabled}
      icon={isFile ? <FileCode2Icon /> : <PuzzleIcon />}
      summary={extensionList(server)}
      status={status}
      chips={
        <>
          <RowChip tone={isFile ? 'accent' : 'neutral'}>
            {isFile ? (
              <>
                <FileCode2Icon className="size-2.5" />
                lsp.json
              </>
            ) : (
              `plugin: ${pluginName}`
            )}
          </RowChip>
          {needsApproval && <RowChip tone="warn">needs approval</RowChip>}
        </>
      }
      onToggle={() => onToggle(server.serverId)}
      expanded={expanded}
      actions={
        <>
          {needsApproval && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={busy === 'approve'}
              onClick={() => onApprove({ pluginName, serverId: server.serverId })}
            >
              <CheckIcon />
              Approve
            </Button>
          )}
          {needsInstall(server, installCommand) && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={busy === 'install'}
              onClick={() => onInstall(server.serverId)}
            >
              <DownloadIcon />
              Install
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Restart ${server.serverId}`}
            title="Restart"
            onClick={() => onAction(server.serverId, 'restart')}
          >
            <RotateCwIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={server.disabled ? `Enable ${server.serverId}` : `Stop ${server.serverId}`}
            title={server.disabled ? 'Enable' : 'Stop'}
            onClick={() => onAction(server.serverId, server.disabled ? 'enable' : 'stop')}
          >
            {server.disabled ? <PlayIcon /> : <PauseIcon />}
          </Button>
          {isFile && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Delete ${server.serverId}`}
              title="Delete"
              disabled={busy === 'remove'}
              onClick={() => onRemove(server.serverId)}
            >
              <Trash2Icon />
            </Button>
          )}
        </>
      }
    >
      <RowSection label="Details">
        <RowField
          label="Command"
          value={[server.command, ...(server.args ?? [])].filter(Boolean).join(' ')}
        />
        <RowField label="Extensions" value={extensionList(server)} />
        <RowField label="Source" value={isFile ? '.harnesys/lsp.json' : `plugin: ${pluginName}`} />
        {problem && (
          <div className="flex flex-col gap-0.5 rounded-md border border-border bg-muted/40 px-2 py-1.5">
            <p className="text-xs">{problem.title}</p>
            {problem.hint && <p className="text-[11px] text-muted-foreground">{problem.hint}</p>}
          </div>
        )}
        {!problem && status.label === 'Off' && (
          <p className="text-muted-foreground text-xs">
            Ready — it starts on the first editor or agent request.
          </p>
        )}
      </RowSection>
    </Row>
  );
}

function needsInstall(server: OrgLspEntry, installCommand: string | undefined): boolean {
  return (
    server.origin === 'file' && !server.disabled && !server.binaryOk && installCommand !== undefined
  );
}

function statusOf(server: OrgLspEntry): { tone: StatusDotTone; label: string } {
  if (server.disabled) {
    return { tone: 'off', label: 'Disabled' };
  }
  if (!server.binaryOk) {
    return { tone: 'wait', label: 'Not installed' };
  }
  if (!server.granted) {
    return { tone: 'wait', label: 'Needs approval' };
  }
  if (server.status === 'live') {
    return { tone: 'live', label: 'Live' };
  }
  if (server.status === 'error') {
    return { tone: 'danger', label: 'Error' };
  }
  return { tone: 'off', label: 'Off' };
}

function extensionList(server: OrgLspEntry): string {
  const extensions = Object.keys(server.extensionToLanguage);
  return extensions.length > 0 ? extensions.join(', ') : 'no extensions';
}

function problemOf(
  server: OrgLspEntry,
  installCommand: string | undefined,
): { title: string; hint?: string } | undefined {
  if (server.disabled) {
    return { title: 'Server is off', hint: 'Press the play button to enable it.' };
  }
  if (!server.granted) {
    return {
      title: 'Plugin server is not approved',
      hint: 'Press Approve to let this plugin-provided server start.',
    };
  }
  if (!server.binaryOk) {
    return {
      title: `Command not found: ${server.command}`,
      hint: installCommand
        ? `Install with: ${installCommand}`
        : 'Make sure the command is on PATH, then press restart.',
    };
  }
  if (server.lastError !== undefined) {
    return { title: server.lastError };
  }
  if (server.status === 'error') {
    return { title: 'Server failed to start', hint: 'Press restart to try again.' };
  }
  return undefined;
}
