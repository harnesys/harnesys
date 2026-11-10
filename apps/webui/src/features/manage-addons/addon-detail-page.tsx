import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import {
  orgAddonDataExportUrl,
  orgAddonDetailQuery,
  orgAddonDetailQueryKey,
  orgAddonMetricsQuery,
  resetOrgAddonQuarantine,
  restartOrgAddon,
} from '@/shared/api/addons';
import { apiUrl } from '@/shared/api/client';
import { studioPath } from '@/shared/config/routes';
import { Button } from '@/shared/ui/button';
import { RowField, RowSection } from '@/shared/ui/capability-rows';
import { SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { AddonLogPanel } from './addon-log-panel';
import { DetailActions } from './detail-actions';
import { deriveAddonBanners } from './lib/banners';
import { defaultSectionEntries, viewSectionsFromDetail } from './lib/view-sections';
import { renderSection } from './section-registry';

export function AddonDetailPage() {
  const { orgId, addonId } = useParams();
  const navigate = useNavigate();
  if (!orgId || !addonId) {
    return <Navigate to="/" replace />;
  }
  return <AddonDetail orgId={orgId} addonId={addonId} navigate={navigate} />;
}

function AddonDetail({
  orgId,
  addonId,
  navigate,
}: {
  orgId: string;
  addonId: string;
  navigate: (path: string) => void;
}) {
  const queryClient = useQueryClient();
  const detail = useQuery(orgAddonDetailQuery(orgId, addonId));
  const [actionError, setActionError] = useState<string | null>(null);

  if (detail.isPending) {
    return (
      <div
        className="flex h-svh min-h-0 w-full flex-col bg-background"
        data-testid="addon-detail-page"
      >
        <DetailHeader
          orgId={orgId}
          title={addonId}
          onBack={() => navigate(studioPath.settings(orgId, 'addons'))}
        />
        <p className="px-6 py-8 text-muted-foreground text-sm">Loading add-on…</p>
      </div>
    );
  }
  if (detail.isError) {
    return (
      <div
        className="flex h-svh min-h-0 w-full flex-col bg-background"
        data-testid="addon-detail-page"
      >
        <DetailHeader
          orgId={orgId}
          title={addonId}
          onBack={() => navigate(studioPath.settings(orgId, 'addons'))}
        />
        <div className="px-6 py-8">
          <SettingsErrorBanner
            message={detail.error instanceof Error ? detail.error.message : String(detail.error)}
            onRetry={() => void detail.refetch()}
            testId="addon-detail-error"
          />
        </div>
      </div>
    );
  }

  const value = detail.data;
  const banners = deriveAddonBanners(value);
  const entries = viewSectionsFromDetail(value) ?? defaultSectionEntries();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: orgAddonDetailQueryKey(orgId, addonId) });

  return (
    <div
      className="flex h-svh min-h-0 w-full flex-col bg-background"
      data-testid="addon-detail-page"
    >
      <DetailHeader
        orgId={orgId}
        title={value.title}
        onBack={() => navigate(studioPath.settings(orgId, 'addons'))}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-6">
          {banners
            .filter((banner) => banner.id !== 'quarantined')
            .map((banner) => (
              <div
                key={banner.id}
                role={banner.tone === 'warning' ? 'alert' : 'status'}
                className={
                  banner.tone === 'warning'
                    ? 'flex flex-col gap-1 rounded-md border border-status-warn/40 bg-status-warn/10 px-3 py-2'
                    : 'flex flex-col gap-1 rounded-md border bg-muted/30 px-3 py-2'
                }
                data-testid={`addon-banner-${banner.id}`}
              >
                <p
                  className={
                    banner.tone === 'warning'
                      ? 'font-medium text-sm text-status-warn'
                      : 'font-medium text-muted-foreground text-sm'
                  }
                >
                  {banner.title}
                </p>
                {banner.detail ? <p className="text-xs leading-4">{banner.detail}</p> : null}
              </div>
            ))}
          {actionError ? (
            <SettingsErrorBanner message={actionError} testId="addon-detail-action-error" />
          ) : null}
          <DetailActions
            orgId={orgId}
            detail={value}
            banners={banners}
            onRemoved={() => navigate(studioPath.settings(orgId, 'addons'))}
          />
          {entries.map((entry, index) => (
            <div
              key={
                entry.kind === 'known'
                  ? `${entry.section.type}-${index}`
                  : `${entry.sectionType}-${index}`
              }
              className="flex min-w-0 flex-col gap-1"
            >
              {renderSection(entry, { orgId, addonId, detail: value, onRefresh: invalidate })}
            </div>
          ))}
          <DiagnosticsSection orgId={orgId} addonId={addonId} onError={setActionError} />
          <AddonLogPanel orgId={orgId} addonId={addonId} />
        </div>
      </div>
    </div>
  );
}

function DetailHeader({
  orgId,
  title,
  onBack,
}: {
  orgId: string;
  title: string;
  onBack: () => void;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={onBack}
        data-testid="addon-detail-back"
      >
        <ArrowLeftIcon data-icon="inline-start" />
        Back to settings
      </Button>
      <span className="truncate font-medium text-sm">{title}</span>
      <span className="sr-only">{orgId}</span>
    </header>
  );
}

function DiagnosticsSection({
  orgId,
  addonId,
  onError,
}: {
  orgId: string;
  addonId: string;
  onError: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const metrics = useQuery(orgAddonMetricsQuery(orgId, addonId));
  const [pending, setPending] = useState(false);

  const act = async (action: () => Promise<void>) => {
    setPending(true);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: orgAddonDetailQueryKey(orgId, addonId) });
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <RowSection label="Diagnostics">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => void act(() => restartOrgAddon(orgId, addonId))}
          data-testid="addon-restart"
        >
          Restart
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => void act(() => resetOrgAddonQuarantine(orgId, addonId))}
          data-testid="addon-quarantine-reset"
        >
          Reset quarantine
        </Button>
        <a
          className="text-muted-foreground text-sm underline decoration-dotted"
          href={apiUrl(orgAddonDataExportUrl(orgId, addonId))}
          data-testid="addon-data-export"
        >
          Download data
        </a>
      </div>
      {metrics.data && metrics.data.counters.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-0.5 pt-1">
          {metrics.data.counters.slice(0, 12).map((point) => (
            <RowField
              key={`${point.name}:${JSON.stringify(point.labels)}`}
              label={point.name}
              value={String(point.value)}
            />
          ))}
        </div>
      ) : null}
    </RowSection>
  );
}
