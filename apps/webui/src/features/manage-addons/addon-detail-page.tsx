import type { OrgAddonDetail } from '@harnesys/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, ChevronRightIcon, PuzzleIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import {
  orgAddonDataExportUrl,
  orgAddonDetailQuery,
  orgAddonDetailQueryKey,
  orgAddonMetricsQuery,
} from '@/shared/api/addons';
import { apiUrl } from '@/shared/api/client';
import { studioPath } from '@/shared/config/routes';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { RowChip } from '@/shared/ui/capability-rows';
import { Card } from '@/shared/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { SettingsErrorBanner, SettingsWarnBanner } from '@/shared/ui/settings-kit';
import { StatusDot } from '@/shared/ui/status-dot';
import { AddonLogPanel } from './addon-log-panel';
import { AddonMark } from './addon-mark';
import { AddonControls, AddonDangerZone } from './detail-actions';
import { KnowledgeSourcesSection } from './knowledge-sources-section';
import type { AddonBanner } from './lib/banners';
import { deriveAddonBanners } from './lib/banners';
import { addonHealthTone } from './lib/health-tone';
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
  const backPath = studioPath.settings(orgId, 'addons');
  const goBack = () => navigate(backPath);

  if (detail.isPending) {
    return (
      <DetailShell
        orgId={orgId}
        onBack={goBack}
        testId="addon-detail-loading"
        body={<p className="px-6 py-8 text-muted-foreground text-sm">Loading add-on...</p>}
      />
    );
  }
  if (detail.isError) {
    return (
      <DetailShell
        orgId={orgId}
        onBack={goBack}
        body={
          <div className="px-6 py-8">
            <SettingsErrorBanner
              message={detail.error instanceof Error ? detail.error.message : String(detail.error)}
              onRetry={() => void detail.refetch()}
              testId="addon-detail-error"
            />
          </div>
        }
      />
    );
  }

  const value = detail.data;
  const banners = deriveAddonBanners(value);
  const entries = viewSectionsFromDetail(value) ?? defaultSectionEntries();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: orgAddonDetailQueryKey(orgId, addonId) });

  return (
    <DetailShell
      orgId={orgId}
      onBack={goBack}
      body={
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
          <AddonHero detail={value}>
            <AddonControls orgId={orgId} detail={value} />
          </AddonHero>
          {banners.map((banner) => (
            <AddonBannerBlock key={banner.id} banner={banner} />
          ))}
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
          <KnowledgeSourcesSection orgId={orgId} addonId={addonId} detail={value} />
          <DiagnosticsSection orgId={orgId} addonId={addonId} />
          <AddonLogPanel orgId={orgId} addonId={addonId} />
          <AddonDangerZone orgId={orgId} detail={value} onRemoved={goBack} />
        </div>
      }
    />
  );
}

function DetailShell({
  orgId,
  onBack,
  body,
  testId,
}: {
  orgId: string;
  onBack: () => void;
  body: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="flex h-svh min-h-0 w-full flex-col bg-background"
      data-testid={testId ?? 'addon-detail-page'}
    >
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
        <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
          <PuzzleIcon className="size-4" />
          Add-ons
        </span>
        <span className="sr-only">{orgId}</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
    </div>
  );
}

function AddonHero({ detail, children }: { detail: OrgAddonDetail; children?: ReactNode }) {
  return (
    <Card className="gap-4 bg-popover p-5" data-testid="addon-detail-hero">
      <div className="flex items-start gap-4">
        <AddonMark size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate font-heading font-medium text-xl">{detail.title}</h1>
            {detail.enabled ? (
              <Badge variant="secondary" data-testid="addon-state">
                Enabled
              </Badge>
            ) : (
              <Badge variant="outline">Not enabled</Badge>
            )}
          </div>
          {detail.description ? (
            <p className="line-clamp-2 text-[13px] text-muted-foreground">{detail.description}</p>
          ) : null}
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-[13px]">
          <StatusDot tone={addonHealthTone(detail.health)} label={detail.health} />
          {detail.health}
        </span>
      </div>
      {detail.lastError ? (
        <p
          className="wrap-anywhere rounded-md bg-destructive/5 px-3 py-2 font-mono text-[11px] text-destructive"
          data-testid="addon-hero-last-error"
        >
          {detail.lastError}
        </p>
      ) : null}
      {children}
      <div className="flex flex-wrap gap-x-10 gap-y-3 border-t pt-4">
        <MetaItem
          label="Version"
          value={
            <span className="flex items-center gap-2">
              <span className="font-mono">{detail.version}</span>
              {detail.updateAvailable ? (
                <RowChip tone="warn">update {detail.updateAvailable}</RowChip>
              ) : null}
            </span>
          }
        />
        <MetaItem label="Runtime profile" value={detail.manifest.runtimeProfile} />
        <MetaItem label="Activation" value={detail.manifest.activation} />
        {detail.manifest.homepage ? (
          <MetaItem label="Homepage" value={detail.manifest.homepage} />
        ) : null}
      </div>
    </Card>
  );
}

function MetaItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-[13px]">{value}</span>
    </div>
  );
}

function AddonBannerBlock({ banner }: { banner: AddonBanner }) {
  if (banner.tone === 'warning') {
    return (
      <SettingsWarnBanner title={banner.title} testId={`addon-banner-${banner.id}`}>
        {banner.detail}
      </SettingsWarnBanner>
    );
  }
  return (
    <div
      role="status"
      className="flex flex-col gap-1 rounded-md border bg-muted/30 px-3 py-2"
      data-testid={`addon-banner-${banner.id}`}
    >
      <p className="font-medium text-muted-foreground text-sm">{banner.title}</p>
      {banner.detail ? <p className="text-xs leading-4">{banner.detail}</p> : null}
    </div>
  );
}

function DiagnosticsSection({ orgId, addonId }: { orgId: string; addonId: string }) {
  const metrics = useQuery(orgAddonMetricsQuery(orgId, addonId));
  const counters = metrics.data?.counters ?? [];
  if (counters.length === 0) {
    return (
      <a
        className="w-fit text-muted-foreground text-sm underline decoration-dotted"
        href={apiUrl(orgAddonDataExportUrl(orgId, addonId))}
        data-testid="addon-data-export"
      >
        Download add-on data
      </a>
    );
  }
  return (
    <Collapsible className="mt-2 flex min-w-0 flex-col gap-1 border-border/40 border-t pt-2">
      <CollapsibleTrigger
        className="group flex w-full items-center gap-1.5 rounded-md px-1 py-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wide hover:text-foreground"
        data-testid="addon-diagnostics-toggle"
      >
        <ChevronRightIcon className="size-3.5 shrink-0 transition-transform group-data-[panel-open]:rotate-90" />
        Diagnostics
        <span className="font-mono font-normal normal-case tabular-nums">{counters.length}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex min-w-0 flex-col gap-0.5 pt-1" data-testid="addon-metrics">
          {counters.slice(0, 12).map((point) => (
            <div
              key={`${point.name}:${JSON.stringify(point.labels)}`}
              className="flex min-w-0 items-baseline justify-between gap-3"
            >
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {point.name}
              </span>
              <span className="shrink-0 font-mono text-[12px] tabular-nums">{point.value}</span>
            </div>
          ))}
          <a
            className="w-fit pt-1 text-muted-foreground text-sm underline decoration-dotted"
            href={apiUrl(orgAddonDataExportUrl(orgId, addonId))}
            data-testid="addon-data-export"
          >
            Download data
          </a>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
