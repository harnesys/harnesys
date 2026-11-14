import type { AddonPolicyView } from '@harnesys/contracts';
import { useEffect, useState } from 'react';
import { getAddonPolicy, putAddonPolicy } from '@/shared/api/addon-packages';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { FieldLabel } from '@/shared/ui/field';
import { SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';

const SOURCE_ITEMS: Array<{ value: string; label: string }> = [
  { value: 'local-dir', label: 'Install from host folders' },
  { value: 'archive', label: 'Install from uploaded archives' },
];

export interface HostPolicyDialogProps {
  onResolve?: (saved?: boolean) => void;
}

export function HostPolicyDialog({ onResolve }: HostPolicyDialogProps) {
  const [loaded, setLoaded] = useState<AddonPolicyView | null>(null);
  const [allowed, setAllowed] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getAddonPolicy()
      .then((policy) => {
        if (!active) {
          return;
        }
        setLoaded(policy);
        setAllowed(new Set(policy.allowedSources));
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const toggle = (value: string, checked: boolean) => {
    setAllowed((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(value);
      } else {
        next.delete(value);
      }
      return next;
    });
  };

  const save = async () => {
    if (!loaded) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const managed = SOURCE_ITEMS.map((item) => item.value);
      const others = loaded.allowedSources.filter((value) => !managed.includes(value));
      await putAddonPolicy({
        ...loaded,
        allowedSources: [...others, ...managed.filter((value) => allowed.has(value))],
      });
      toast.add({ type: 'success', title: 'Add-on source policy saved' });
      onResolve?.(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-md" data-testid="host-policy-dialog">
        <DialogHeader>
          <DialogTitle>Host source policy</DialogTitle>
          <DialogDescription>
            Choose which add-on install sources this host allows.
          </DialogDescription>
        </DialogHeader>
        {error ? <SettingsErrorBanner message={error} /> : null}
        {loaded ? (
          <div className="flex flex-col gap-3">
            {SOURCE_ITEMS.map((item) => (
              <div key={item.value} className="flex items-center gap-2">
                <Checkbox
                  id={`host-policy-${item.value}`}
                  checked={allowed.has(item.value)}
                  onCheckedChange={(checked) => toggle(item.value, checked === true)}
                />
                <FieldLabel htmlFor={`host-policy-${item.value}`}>{item.label}</FieldLabel>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            {error ? 'Could not load the policy.' : 'Loading policy...'}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onResolve?.()}>
            Cancel
          </Button>
          <Button disabled={pending || !loaded} onClick={() => void save()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
