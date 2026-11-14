import type { OrgAddonDetail } from '@harnesys/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  orgAddonSourceKindsQuery,
  orgAddonSourceKindsQueryKey,
  orgAddonSourcesQuery,
  orgAddonSourcesQueryKey,
} from '@/shared/api/addon-sources';
import { RowSection } from '@/shared/ui/capability-rows';
import { SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { KnowledgeSourceKind } from './knowledge-source-kind';

interface KnowledgeSourcesSectionProps {
  orgId: string;
  addonId: string;
  detail: OrgAddonDetail;
}

export function KnowledgeSourcesSection({ orgId, addonId, detail }: KnowledgeSourcesSectionProps) {
  const queryClient = useQueryClient();
  const hasSourceKind = detail.contributions.some(
    (contribution) => contribution.family === 'source-kind',
  );
  const kinds = useQuery({ ...orgAddonSourceKindsQuery(orgId, addonId), enabled: hasSourceKind });
  const sources = useQuery({ ...orgAddonSourcesQuery(orgId, addonId), enabled: hasSourceKind });

  if (!hasSourceKind) {
    return null;
  }

  const onChanged = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orgAddonSourceKindsQueryKey(orgId, addonId) }),
      queryClient.invalidateQueries({ queryKey: orgAddonSourcesQueryKey(orgId, addonId) }),
    ]);
  };

  if (kinds.isError) {
    return (
      <SettingsErrorBanner
        message={kinds.error instanceof Error ? kinds.error.message : String(kinds.error)}
        onRetry={() => void kinds.refetch()}
        testId="addon-source-kinds-error"
      />
    );
  }

  const rows = kinds.data?.kinds ?? [];
  if (rows.length === 0) {
    return null;
  }

  const allSources = sources.data?.sources ?? [];
  const sourcesFor = (sourceKindId: string) =>
    allSources.filter(
      (source) =>
        source.distribution.kind === 'addon-cloud' &&
        source.distribution.sourceKindId === sourceKindId,
    );

  return (
    <RowSection label="Knowledge sources" count={rows.length}>
      {rows.map((kind) => (
        <KnowledgeSourceKind
          key={kind.id}
          orgId={orgId}
          addonId={addonId}
          kind={kind}
          sources={sourcesFor(kind.id)}
          onChanged={onChanged}
        />
      ))}
    </RowSection>
  );
}
