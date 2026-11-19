import type { Source } from '@harnesys/contracts';
import type { AddonSourceKind } from '@/shared/api/addon-sources';
import { RowChip } from '@/shared/ui/capability-rows';
import { SettingsWarnBanner } from '@/shared/ui/settings-kit';
import { AddonSourcePicker } from '@/widgets/addon-source-picker';
import { KnowledgeSourceSources } from './knowledge-source-sources';

interface KnowledgeSourceKindProps {
  orgId: string;
  addonId: string;
  kind: AddonSourceKind;
  sources: Source[];
  onChanged: () => Promise<void>;
}

export function KnowledgeSourceKind({
  orgId,
  addonId,
  kind,
  sources,
  onChanged,
}: KnowledgeSourceKindProps) {
  const blocked = Boolean(kind.connection) && kind.accountIds.length === 0;

  return (
    <div
      className="flex min-w-0 flex-col gap-2 rounded-md border px-3 py-2"
      data-testid={`addon-source-kind-${kind.id}`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium text-sm">{kind.title}</span>
        <RowChip tone="neutral">{kind.attached} attached</RowChip>
      </div>

      {blocked ? (
        <SettingsWarnBanner
          title="Bind an account first"
          testId={`addon-source-kind-blocked-${kind.id}`}
        >
          This folder source uses the {kind.connection} connection. Bind an account before browsing.
        </SettingsWarnBanner>
      ) : (
        <AddonSourcePicker orgId={orgId} addonId={addonId} kind={kind} onChanged={onChanged} />
      )}

      <KnowledgeSourceSources
        orgId={orgId}
        addonId={addonId}
        sources={sources}
        onChanged={onChanged}
      />
    </div>
  );
}
