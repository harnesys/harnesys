import type { AddonSummary } from '@harnesys/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Row, RowChip, RowField, RowItem, RowList, RowSection } from '@/shared/ui/capability-rows';
import { SettingsEmpty, SettingsErrorBanner, SettingsSection } from '@/shared/ui/settings-kit';
import { AddonConfigForm } from './addon-config-form';
import { AddonLogPanel } from './addon-log-panel';
import { disableOrgAddon, enableOrgAddon, getOrgAddon, orgAddonsQuery } from './api';

export function ManageAddonsPane({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const { data: response, isPending, error } = useQuery(orgAddonsQuery(orgId));
  const addons = response ?? [];
  const [selectedAddonId, setSelectedAddonId] = useState<string | null>(null);

  if (error) {
    return (
      <div className="flex w-full flex-col gap-8" data-testid="manage-addons-pane">
        <SettingsErrorBanner
          message={error instanceof Error ? error.message : String(error)}
          testId="manage-addons-error"
        />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-8" data-testid="manage-addons-pane">
      <SettingsSection
        label="Add-ons"
        count={isPending ? undefined : addons.length}
        description="Discovered and enabled add-ons for this organization."
        testId="manage-addons"
      >
        {addons.length === 0 ? (
          <SettingsEmpty
            title={isPending ? 'Loading add-ons' : 'No add-ons yet'}
            description={
              isPending
                ? 'Reading the org add-on catalog.'
                : 'Install an add-on into ~/.harnesys/add-ons to see it here.'
            }
            testId="manage-addons-empty"
          />
        ) : (
          <RowList testId="manage-addons-list">
            {addons.map((addon) => {
              const selected = addon.id === selectedAddonId;
              return (
                <Row
                  key={addon.id}
                  testId={`manage-addon-${addon.id}`}
                  title={addon.title}
                  mono={false}
                  summary={addon.id}
                  chips={
                    <>
                      <RowChip>{addon.version}</RowChip>
                      {addon.state === 'enabled' ? <RowChip tone="ok">enabled</RowChip> : null}
                    </>
                  }
                  expanded={selected}
                  onToggle={() => setSelectedAddonId(selected ? null : addon.id)}
                >
                  {selected ? (
                    <AddonDetailPanel
                      key={`${orgId}:${addon.id}`}
                      orgId={orgId}
                      addon={addon}
                      onChanged={async () => {
                        await queryClient.invalidateQueries({
                          queryKey: ['orgs', orgId, 'addons'],
                        });
                      }}
                    />
                  ) : null}
                </Row>
              );
            })}
          </RowList>
        )}
      </SettingsSection>
    </div>
  );
}

type AddonDetailState =
  | { kind: 'loading' }
  | { kind: 'ready'; value: Awaited<ReturnType<typeof getOrgAddon>> }
  | { kind: 'error'; message: string };

function AddonDetailPanel({
  orgId,
  addon,
  onChanged,
}: {
  orgId: string;
  addon: AddonSummary;
  onChanged: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<AddonDetailState>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail({ kind: 'loading' });
    setError(null);
    getOrgAddon(orgId, addon.id)
      .then((loaded) => {
        if (!cancelled) {
          setDetail({ kind: 'ready', value: loaded });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setDetail({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [addon.id, orgId]);

  const onToggle = async () => {
    setBusy(true);
    setError(null);
    try {
      if (addon.state === 'enabled') {
        await disableOrgAddon(orgId, addon.id);
      } else {
        await enableOrgAddon(orgId, addon.id);
      }
      await onChanged();
      const reloaded = await getOrgAddon(orgId, addon.id);
      setDetail({ kind: 'ready', value: reloaded });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const detailValue = detail.kind === 'ready' ? detail.value : null;
  const contributions = detailValue?.contributions ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid={`addon-detail-${addon.id}`}>
      {detail.kind === 'error' ? (
        <SettingsErrorBanner message={detail.message} testId="addon-detail-error" />
      ) : null}
      {error ? <SettingsErrorBanner message={error} testId="addon-action-error" /> : null}
      <RowField label="id" value={addon.id} />
      <RowField label="version" value={addon.version} />
      <RowField label="state" value={<Badge variant="outline">{addon.state}</Badge>} />
      <RowField label="execution" value={addon.execution} />
      <RowField label="running" value={detailValue?.running ? 'yes' : 'no'} />
      {addon.description ? (
        <p className="text-muted-foreground text-xs leading-4">{addon.description}</p>
      ) : null}
      {addon.families.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {addon.families.map((family) => (
            <Badge key={family} variant="secondary">
              {family}
            </Badge>
          ))}
        </div>
      ) : null}
      {addon.tags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {addon.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}
      {detailValue?.lastError ? (
        <SettingsErrorBanner message={detailValue.lastError} testId="addon-last-error" />
      ) : null}
      {detailValue ? (
        <>
          <RowSection label="Contributions" count={contributions.length}>
            {contributions.length === 0 ? (
              <RowItem title="No contributions declared" />
            ) : (
              contributions.map((contribution) => (
                <RowItem
                  key={contribution.id}
                  title={contribution.id}
                  description={`${contribution.family} — ${JSON.stringify(contribution.descriptor).slice(0, 160)}`}
                  testId={`addon-contribution-${contribution.id}`}
                />
              ))
            )}
          </RowSection>
          {detailValue.config?.fields && detailValue.config.fields.length > 0 ? (
            <AddonConfigForm
              key={addon.id}
              orgId={orgId}
              addonId={addon.id}
              fields={detailValue.config.fields}
              values={detailValue.values}
              onSaved={async () => {
                try {
                  const reloaded = await getOrgAddon(orgId, addon.id);
                  setDetail({ kind: 'ready', value: reloaded });
                } catch {
                  // keep the current snapshot
                }
              }}
            />
          ) : null}
        </>
      ) : null}
      <RowSection label="Runtime">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void onToggle()}
            data-testid={`addon-toggle-${addon.id}`}
          >
            {addon.state === 'enabled' ? 'Disable' : 'Enable'}
          </Button>
        </div>
      </RowSection>
      {addon.state === 'enabled' ? (
        <AddonLogPanel key={addon.id} orgId={orgId} addonId={addon.id} />
      ) : null}
    </div>
  );
}
