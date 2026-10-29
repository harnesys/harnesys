import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Progress } from '@/shared/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { toast } from '@/shared/ui/toast';
import {
  type BrowserInstallProgress,
  type BrowserVersionOption,
  type EngineSpec,
  installOrgBrowserEngine,
  orgBrowserQueryKey,
  orgEngineVersionsQuery,
} from './org-browser-api';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function integrityLabel(option: BrowserVersionOption): string {
  return option.sha256 === null ? 'publisher checksum unavailable' : 'checksum verified';
}

interface EngineInstallDialogProps {
  orgId: string;
  hostId: string;
  spec: EngineSpec;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstalled: (version: string) => void;
}

export function EngineInstallDialog({
  orgId,
  hostId,
  spec,
  open,
  onOpenChange,
  onInstalled,
}: EngineInstallDialogProps) {
  const queryClient = useQueryClient();
  const versionsQuery = useQuery(orgEngineVersionsQuery(orgId, hostId, spec.id, open));
  const versions = versionsQuery.data?.versions ?? [];
  const initial = versions.find((option) => option.recommended) ?? versions[0];
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [percent, setPercent] = useState<number | null>(null);
  const chosen = versions.find((option) => option.version === selected) ?? initial;

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: orgBrowserQueryKey(orgId) });
  }

  const install = useMutation({
    mutationFn: (version: string) =>
      installOrgBrowserEngine(
        orgId,
        { hostId, engine: spec.id, stealth: spec.stealthBuild === true, version },
        (frame: BrowserInstallProgress) => {
          setPercent(
            frame.phase === 'download' && frame.totalBytes
              ? Math.min(100, Math.round(((frame.receivedBytes ?? 0) / frame.totalBytes) * 100))
              : null,
          );
        },
      ),
    onSuccess: (_result, version) => {
      refresh();
      toast.add({ title: `${spec.label} installed`, description: `v${version} @ ${hostId}` });
      onInstalled(version);
      onOpenChange(false);
    },
    onError: (error) => {
      toast.add({ title: `Failed to install ${spec.label}`, description: errorMessage(error) });
    },
  });

  function handleOpenChange(next: boolean) {
    if (!install.isPending) {
      setSelected(undefined);
      setPercent(null);
      onOpenChange(next);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid={`engine-install-dialog-${spec.id}`}>
        <DialogHeader>
          <DialogTitle>
            Install {spec.label}
            {spec.stealthBuild === true ? ' (stealth build)' : ''}
          </DialogTitle>
          <DialogDescription>
            {spec.license} · ~{spec.resources.ramMb}MB RAM · {spec.resources.diskMb}MB disk. The
            recommended version is pinned and checksum-verified in the catalog.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Select
            value={chosen?.version}
            onValueChange={(value) => setSelected(value ?? undefined)}
            disabled={install.isPending || versions.length === 0}
          >
            <SelectTrigger data-testid={`engine-version-select-${spec.id}`}>
              <SelectValue
                placeholder={versionsQuery.isPending ? 'Loading versions…' : 'Version'}
              />
            </SelectTrigger>
            <SelectContent>
              {versions.map((option) => (
                <SelectItem
                  key={option.version}
                  value={option.version}
                  disabled={!option.supported}
                >
                  v{option.version}
                  {option.recommended ? ' — recommended' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {chosen && (
            <p className="flex items-center gap-2 text-muted-foreground text-xs">
              <Badge variant={chosen.sha256 === null ? 'outline' : 'secondary'}>
                {integrityLabel(chosen)}
              </Badge>
              {chosen.sha256 === null
                ? 'The publisher does not publish checksums for this version; the download is served over HTTPS only.'
                : 'Download integrity is verified against a pinned sha256.'}
            </p>
          )}
          {install.isPending && (
            <div className="flex items-center gap-3">
              <Progress value={percent} className="flex-1" />
              <span className="w-10 text-right text-xs tabular-nums">
                {percent === null ? '…' : `${percent}%`}
              </span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={install.isPending}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={chosen === undefined || !chosen.supported || install.isPending}
            onClick={() => chosen !== undefined && install.mutate(chosen.version)}
            data-testid={`engine-install-confirm-${spec.id}`}
          >
            {install.isPending ? 'Installing…' : 'Install'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
