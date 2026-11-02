import type {
  ToolchainCommandSource,
  ToolchainCommandStatus,
  ToolchainDiscovery,
} from '@harnesys/contracts';
import { DownloadIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { SettingsEmpty, SettingsSection } from '@/shared/ui/settings-kit';
import { StatusDot, type StatusDotTone } from '@/shared/ui/status-dot';

const SOURCE_LABEL: Record<ToolchainCommandSource, string> = {
  override: 'override',
  path: 'PATH',
  missing: 'not found',
};

const SOURCE_TONE: Record<ToolchainCommandSource, StatusDotTone> = {
  override: 'live',
  path: 'live',
  missing: 'danger',
};

interface OrgToolchainCommandsProps {
  discovery: ToolchainDiscovery;
  overrides: Record<string, string>;
  onOverrideChange: (command: string, value: string) => void;
  onInstall: (serverId: string) => void;
  installBusy: boolean;
}

export function OrgToolchainCommands({
  discovery,
  overrides,
  onOverrideChange,
  onInstall,
  installBusy,
}: OrgToolchainCommandsProps) {
  return (
    <SettingsSection
      label="Dependencies"
      count={discovery.commands.length}
      description="Resolved through the effective PATH. An override wins over PATH lookup."
    >
      {discovery.commands.length === 0 ? (
        <SettingsEmpty
          title="No dependencies resolved yet"
          description="Configure servers in the LSP settings — they appear here with their resolution state."
        />
      ) : (
        <div
          className="flex flex-col divide-y rounded-md border"
          data-testid="org-toolchain-commands"
        >
          {discovery.commands.map((status) => (
            <CommandRow
              key={status.command}
              status={status}
              override={overrides[status.command] ?? ''}
              onOverrideChange={(value) => onOverrideChange(status.command, value)}
              onInstall={onInstall}
              installBusy={installBusy}
            />
          ))}
        </div>
      )}
    </SettingsSection>
  );
}

interface CommandRowProps {
  status: ToolchainCommandStatus;
  override: string;
  onOverrideChange: (value: string) => void;
  onInstall: (serverId: string) => void;
  installBusy: boolean;
}

function CommandRow({
  status,
  override,
  onOverrideChange,
  onInstall,
  installBusy,
}: CommandRowProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2"
      data-testid={`toolchain-command-${status.command}`}
    >
      <StatusDot tone={SOURCE_TONE[status.source]} label={SOURCE_LABEL[status.source]} />
      <div className="min-w-36 flex-1">
        <p className="truncate font-mono text-xs leading-4">{status.command}</p>
        <p className="truncate text-[11px] text-muted-foreground leading-4">
          {status.resolvedPath ?? SOURCE_LABEL[status.source]}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          aria-label={`Override for ${status.command}`}
          placeholder="absolute path"
          className="h-7 w-56 font-mono text-xs"
          value={override}
          onChange={(event) => onOverrideChange(event.target.value)}
        />
        {status.serverId !== undefined && !status.resolvedPath ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={installBusy}
            onClick={() => onInstall(status.serverId ?? '')}
          >
            <DownloadIcon />
            Install
          </Button>
        ) : null}
      </div>
    </div>
  );
}
