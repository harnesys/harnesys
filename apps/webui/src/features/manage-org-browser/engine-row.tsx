import { DownloadIcon, GlobeIcon, PauseIcon, PlayIcon, StarIcon, Trash2Icon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/shared/ui/button';
import { Row, RowChip, RowField, RowSection } from '@/shared/ui/capability-rows';
import type { EngineSpec, HostEngineEntry } from './org-browser-api';

function capabilityChips(spec: EngineSpec): string[] {
  const chips: string[] = [];
  if (spec.capabilities.screenshots) {
    chips.push('screenshots');
  }
  if (spec.capabilities.pdf) {
    chips.push('pdf');
  }
  if (spec.capabilities.stealth) {
    chips.push('stealth build');
  }
  if (spec.capabilities.ssrfGuard) {
    chips.push('ssrf guard');
  }
  if (spec.capabilities.markdown) {
    chips.push('markdown');
  }
  if (spec.capabilities.oneShotFetch) {
    chips.push('fetch cli');
  }
  return chips;
}

function summaryText(spec: EngineSpec): string {
  return `${spec.license} · ~${spec.resources.ramMb}MB RAM · ${spec.resources.diskMb}MB disk`;
}

function rowChips(entry: HostEngineEntry, spec: EngineSpec, isDefault: boolean): ReactNode {
  return (
    <>
      {isDefault && <RowChip tone="accent">org default</RowChip>}
      {entry.installed && (entry.managedVersions?.length ?? 0) === 0 && <RowChip>system</RowChip>}
      {!entry.installed && <RowChip tone="warn">not installed</RowChip>}
      {entry.broken && <RowChip tone="danger">broken</RowChip>}
      {capabilityChips(spec).map((capability) => (
        <RowChip key={capability}>{capability}</RowChip>
      ))}
    </>
  );
}

interface RowActionsArgs {
  entry: HostEngineEntry;
  spec: EngineSpec;
  hostId: string;
  isDefault: boolean;
  onDefault: () => void;
  onInstall: () => void;
  onToggleEnabled: () => void;
  onRemove: () => void;
}

function rowActions({
  entry,
  spec,
  hostId,
  isDefault,
  onDefault,
  onInstall,
  onToggleEnabled,
  onRemove,
}: RowActionsArgs): ReactNode {
  return (
    <>
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground"
        aria-label={
          isDefault ? `Reset ${spec.label} as org default` : `Set ${spec.label} as org default`
        }
        title={isDefault ? 'Org default (click to reset to auto)' : 'Set as org default'}
        onClick={onDefault}
      >
        <StarIcon className={isDefault ? 'fill-amber-400 text-amber-400' : undefined} />
      </Button>
      {!entry.installed && spec.install !== undefined && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          aria-label={`Install ${spec.label} on ${hostId}`}
          title="Install"
          data-testid={`browser-install-${entry.engineId}-${hostId}`}
          onClick={onInstall}
        >
          <DownloadIcon />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground"
        aria-label={entry.enabled ? `Disable ${spec.label}` : `Enable ${spec.label}`}
        title={entry.enabled ? 'Disable' : 'Enable'}
        onClick={onToggleEnabled}
      >
        {entry.enabled ? <PauseIcon /> : <PlayIcon />}
      </Button>
      {(spec.install !== undefined || !entry.installed) && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          aria-label={`Remove ${spec.label} from ${hostId}`}
          title="Remove"
          onClick={onRemove}
        >
          <Trash2Icon />
        </Button>
      )}
    </>
  );
}

function sourceLabel(versions: string[], managedCount: number): string {
  if (managedCount === 0) {
    return 'system';
  }
  if (versions.length > managedCount) {
    return 'managed + system';
  }
  return 'managed';
}

function versionMeta(installedVersion: string | undefined, versions: string[]): string | undefined {
  if (installedVersion === undefined) {
    return undefined;
  }
  if (versions.length > 1) {
    return `v${installedVersion} · ${versions.length} versions`;
  }
  return `v${installedVersion}`;
}

interface HostEngineRowProps {
  entry: HostEngineEntry;
  spec: EngineSpec;
  hostId: string;
  isDefault: boolean;
  expanded: boolean;
  onExpand: () => void;
  onDefault: () => void;
  onInstall: () => void;
  onToggleEnabled: () => void;
  onRemove: () => void;
}

export function HostEngineRow({
  entry,
  spec,
  hostId,
  isDefault,
  expanded,
  onExpand,
  onDefault,
  onInstall,
  onToggleEnabled,
  onRemove,
}: HostEngineRowProps) {
  const installedVersion = entry.installed ? (entry.version ?? spec.version) : undefined;
  const versions = entry.versions ?? [];
  const managedCount = entry.managedVersions?.length ?? 0;
  const meta = versionMeta(installedVersion, versions);
  return (
    <Row
      testId={`browser-row-${hostId}-${entry.engineId}`}
      icon={<GlobeIcon />}
      title={spec.label}
      muted={!entry.enabled || !entry.installed}
      meta={meta}
      chips={rowChips(entry, spec, isDefault)}
      summary={<div className="flex h-4 items-center">{summaryText(spec)}</div>}
      expanded={expanded}
      onToggle={onExpand}
      actions={rowActions({
        entry,
        spec,
        hostId,
        isDefault,
        onDefault,
        onInstall,
        onToggleEnabled,
        onRemove,
      })}
    >
      {expanded ? (
        <RowSection label="Details">
          <RowField
            label="Version"
            value={installedVersion === undefined ? 'not installed' : `v${installedVersion}`}
          />
          {versions.length > 1 && (
            <RowField label="Versions" value={versions.map((item) => `v${item}`).join(', ')} />
          )}
          {entry.installed && (
            <RowField label="Source" value={sourceLabel(versions, managedCount)} />
          )}
          <RowField label="License" value={spec.license} />
          <RowField label="Resources" value={summaryText(spec)} />
        </RowSection>
      ) : null}
    </Row>
  );
}
