import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchAddonRoute, orgAddonDetailQueryKey } from '@/shared/api/addons';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { RowSection } from '@/shared/ui/capability-rows';
import { SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { handleSectionResult, resolveL10nText, routeParamsOf } from '../lib/route-call';
import type { SectionProps } from '../lib/section-props';
import type { AddonSectionAction } from '../lib/view-sections';

export function ActionsSection({ orgId, addonId, section, onRefresh }: SectionProps) {
  const actions = Array.isArray(section.actions) ? (section.actions as AddonSectionAction[]) : [];
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: AddonSectionAction) => {
    setBusy(action.id);
    setError(null);
    try {
      const response = await fetchAddonRoute(
        orgId,
        addonId,
        action.route.route,
        routeParamsOf(action.route),
        { method: 'POST' },
      );
      handleSectionResult(response, onRefresh);
      await queryClient.invalidateQueries({
        queryKey: orgAddonDetailQueryKey(orgId, addonId),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <RowSection label="Actions" count={actions.length}>
      {error ? <SettingsErrorBanner message={error} testId="addon-actions-error" /> : null}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {actions.map((action) => (
          <Button
            key={action.id}
            type="button"
            size="sm"
            variant={action.destructive ? 'destructive' : 'outline'}
            disabled={busy === action.id}
            onClick={() => {
              if (action.confirm) {
                void alert
                  .confirm({
                    title: resolveL10nText(action.confirm),
                    testId: `addon-action-${action.id}`,
                  })
                  .then((ok) => {
                    if (ok) {
                      void run(action);
                    }
                  });
                return;
              }
              void run(action);
            }}
            data-testid={`addon-action-${action.id}`}
          >
            {resolveL10nText(action.label)}
          </Button>
        ))}
      </div>
    </RowSection>
  );
}
