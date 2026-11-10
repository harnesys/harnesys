import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { addonPackagesQuery, deleteAddonPackage } from '@/shared/api/addon-packages';
import { ApiError } from '@/shared/api/client';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { RowItem } from '@/shared/ui/capability-rows';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';

export function HostPackagesCard() {
  const queryClient = useQueryClient();
  const packages = useQuery(addonPackagesQuery());
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['addon-packages'] });

  const removeVersion = async (id: string, version: string) => {
    setPending(true);
    setError(null);
    try {
      await deleteAddonPackage(id, version);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.add({
          type: 'warning',
          title: 'Version in use',
          description: 'One or more organizations still pin this version.',
        });
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setPending(false);
    }
  };

  const items = packages.data?.items ?? [];
  const grouped = groupById(items);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border px-3 py-2">
        <CollapsibleTrigger
          render={
            <button
              type="button"
              className="flex w-full items-center gap-2 text-left"
              data-testid="addon-packages-toggle"
            />
          }
        >
          <span className="min-w-0 flex-1 font-medium text-sm">Installed packages</span>
          <Badge variant="outline">{items.length}</Badge>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex min-w-0 flex-col gap-2 pt-2">
            {error ? <SettingsErrorBanner message={error} testId="addon-packages-error" /> : null}
            {Array.from(grouped.entries()).map(([id, versions]) => (
              <div key={id} className="flex min-w-0 flex-col gap-1 rounded-md border px-3 py-2">
                <p className="truncate font-mono text-sm">{id}</p>
                {versions.map((pkg) => (
                  <div key={pkg.version} className="flex min-w-0 items-center gap-2">
                    <span className="font-mono text-xs">{pkg.version}</span>
                    <Badge variant="secondary">{pkg.trust}</Badge>
                    <span className="flex-1" />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => void removeVersion(pkg.id, pkg.version)}
                      data-testid={`addon-package-delete-${pkg.id}-${pkg.version}`}
                    >
                      Delete
                    </Button>
                  </div>
                ))}
                {versions[0] ? <RowItem title={versions[0].description} /> : null}
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function groupById(items: { id: string; version: string; trust: string; description: string }[]) {
  const grouped = new Map<
    string,
    { id: string; version: string; trust: string; description: string }[]
  >();
  for (const item of items) {
    const list = grouped.get(item.id) ?? [];
    list.push(item);
    grouped.set(item.id, list);
  }
  return grouped;
}
