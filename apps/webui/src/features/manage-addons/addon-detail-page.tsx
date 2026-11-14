import type { AddonTrust, OrgAddonDetail, OrgAddonHealth } from '@harnesys/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, ChevronRightIcon, PuzzleIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Fragment } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { addonPackagesQuery } from '@/shared/api/addon-packages';
import { orgAddonDetailQuery } from '@/shared/api/addons';
import { studioPath } from '@/shared/config/routes';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { RowChip } from '@/shared/ui/capability-rows';
import { Card } from '@/shared/ui/card';
import { SettingsErrorBanner, SettingsWarnBanner } from '@/shared/ui/settings-kit';
import { StatusDot } from '@/shared/ui/status-dot';
import { AddonLogPanel } from './addon-log-panel';
import { AddonMark } from './addon-mark';
import { AddonControls } from './detail-actions';
import { KnowledgeSourcesSection } from './knowledge-sources-section';
import {
  ADDON_TRUST_LABEL,
  activationLabel,
  addonHealthLabel,
  addonHealthTone,
  runtimeProfileLabel,
} from './lib/addon-labels';
import { invalidateAddonScope } from './lib/addon-scope';
import type { AddonBanner } from './lib/banners';
import { deriveAddonBanners } from './lib/banners';
import {
  defaultSectionEntries,
  ensurePermissionsSection,
  isPreviewSection,
  sortSectionEntries,
  viewSectionsFromDetail,
} from './lib/view-sections';
import { renderSection } from './section-registry';
import { DiagnosticsSection } from './sections/diagnostics-section';

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
  const packages = useQuery(addonPackagesQuery());
  const backPath = studioPath.settings(orgId, 'addons');
  const goBack = () => navigate(backPath);

  if (detail.isPending) {
    return (
      <DetailShell
        onBack={goBack}
        testId="addon-detail-loading"
        body={<p className="px-6 py-8 text-muted-foreground text-sm">Loading add-on...</p>}
      />
    );
  }
  if (detail.isError) {
    return (
      <DetailShell
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
  const installed = value.installed;
  const installedPackages = packages.data?.items ?? [];
  const trust =
    (
      installedPackages.find((pkg) => pkg.id === addonId && pkg.version === value.version) ??
      installedPackages.find((pkg) => pkg.id === addonId)
    )?.trust ?? null;
  const banners = deriveAddonBanners(value, trust);
  const entries = sortSectionEntries(
    ensurePermissionsSection(
      (viewSectionsFromDetail(value) ?? defaultSectionEntries()).filter(
        (entry) => installed || isPreviewSection(entry),
      ),
    ),
  );
  const invalidate = () => void invalidateAddonScope(queryClient, orgId);

  return (
    <DetailShell
      onBack={goBack}
      title={value.title}
      body={
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-7 py-10">
          <AddonHero detail={value} trust={trust}>
            <AddonControls orgId={orgId} detail={value} onRemoved={goBack} />
          </AddonHero>
          {banners.length > 0 ? (
            <div className="flex flex-col gap-3">
              {banners.map((banner) => (
                <AddonBannerBlock key={banner.id} banner={banner} />
              ))}
            </div>
          ) : null}
          <div className="flex min-w-0 flex-col">
            {entries.map((entry, index) => (
              <Fragment
                key={
                  entry.kind === 'known'
                    ? `${entry.section.type}-${index}`
                    : `${entry.sectionType}-${index}`
                }
              >
                {renderSection(entry, {
                  orgId,
                  addonId,
                  detail: value,
                  installed,
                  onRefresh: invalidate,
                })}
              </Fragment>
            ))}
            {installed ? (
              <KnowledgeSourcesSection orgId={orgId} addonId={addonId} detail={value} />
            ) : null}
            {installed ? <DiagnosticsSection orgId={orgId} addonId={addonId} /> : null}
            {installed ? <AddonLogPanel orgId={orgId} addonId={addonId} /> : null}
          </div>
        </div>
      }
    />
  );
}

function DetailShell({
  onBack,
  body,
  title,
  testId,
}: {
  onBack: () => void;
  body: ReactNode;
  title?: string;
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
          Add-ons
        </Button>
        <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/50" />
        <span className="flex min-w-0 items-center gap-1.5 text-sm">
          <PuzzleIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{title ?? 'Add-on'}</span>
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
    </div>
  );
}

function stateLabel(detail: OrgAddonDetail): string {
  if (!detail.installed) {
    return 'Not enabled';
  }
  return detail.enabled ? 'Enabled' : 'Disabled';
}

function AddonHero({
  detail,
  trust,
  children,
}: {
  detail: OrgAddonDetail;
  trust: AddonTrust | null;
  children?: ReactNode;
}) {
  return (
    <Card className="gap-5 bg-popover p-5" data-testid="addon-detail-hero">
      <div className="flex items-start gap-4">
        <AddonMark size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="truncate font-heading font-medium text-xl">{detail.title}</h1>
            <Badge variant={detail.enabled ? 'secondary' : 'outline'} data-testid="addon-state">
              {stateLabel(detail)}
            </Badge>
            {trust ? <Badge variant="outline">{ADDON_TRUST_LABEL[trust]}</Badge> : null}
          </div>
          <p className="truncate font-mono text-[11px] text-muted-foreground">{detail.addonId}</p>
          {detail.description ? (
            <p className="line-clamp-2 text-[13px] text-muted-foreground">{detail.description}</p>
          ) : null}
        </div>
        {detail.enabled ? <HealthValue health={detail.health} /> : null}
      </div>
      {detail.lastError ? (
        <p
          className="wrap-anywhere rounded-md bg-destructive/5 px-3 py-2 font-mono text-[11px] text-destructive"
          data-testid="addon-hero-last-error"
        >
          {detail.lastError}
        </p>
      ) : null}
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
        <MetaItem
          label="Runtime profile"
          value={runtimeProfileLabel(detail.manifest.runtimeProfile)}
        />
        <MetaItem label="Activation" value={activationLabel(detail.manifest.activation)} />
        {detail.manifest.license ? (
          <MetaItem label="License" value={detail.manifest.license} />
        ) : null}
        {detail.manifest.homepage ? (
          <MetaItem
            label="Homepage"
            value={
              <a
                className="inline-block max-w-64 truncate align-bottom text-primary underline-offset-4 hover:underline"
                href={detail.manifest.homepage}
                target="_blank"
                rel="noreferrer"
              >
                {detail.manifest.homepage}
              </a>
            }
          />
        ) : null}
      </div>
      {children}
    </Card>
  );
}

function HealthValue({ health }: { health: OrgAddonHealth }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-[13px]" data-testid="addon-health">
      <StatusDot tone={addonHealthTone(health)} label={addonHealthLabel(health)} />
      {addonHealthLabel(health)}
    </span>
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
  const body = (
    <>
      {banner.detail ? <p className="text-xs leading-4">{banner.detail}</p> : null}
      {banner.notes && banner.notes.length > 0 ? (
        <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs leading-4">
          {banner.notes.map((note) => (
            <li key={note} className="wrap-anywhere">
              {note}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );

  if (banner.tone === 'danger') {
    return (
      <SettingsErrorBanner
        testId={`addon-banner-${banner.id}`}
        message={
          <div className="flex flex-col gap-1">
            <p className="font-medium">{banner.title}</p>
            {body}
          </div>
        }
      />
    );
  }
  if (banner.tone === 'warning') {
    return (
      <SettingsWarnBanner title={banner.title} testId={`addon-banner-${banner.id}`}>
        <div className="flex flex-col gap-1">{body}</div>
      </SettingsWarnBanner>
    );
  }
  return (
    <div
      role="status"
      className="flex flex-col gap-1 rounded-md border bg-muted/30 px-3 py-2"
      data-testid={`addon-banner-${banner.id}`}
    >
      <p className="font-medium text-sm">{banner.title}</p>
      {body}
    </div>
  );
}
