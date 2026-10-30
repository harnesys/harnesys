import { useQuery } from '@tanstack/react-query';
import { ExternalLinkIcon } from 'lucide-react';
import { useEffect } from 'react';
import { appMetaQuery } from '@/shared/api';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Markdown } from '@/shared/ui/markdown';
import { Progress } from '@/shared/ui/progress';
import { Switch } from '@/shared/ui/switch';
import { isDesktop, openReleaseNotes } from '../model/app-update';
import { useAppUpdateStore } from '../model/app-update.store';
import { isNewerVersion, latestReleaseQuery, releasePageUrl } from '../model/server-update';

export function UpdatePane() {
  const status = useAppUpdateStore((state) => state.status);
  const currentVersion = useAppUpdateStore((state) => state.currentVersion);
  const availableVersion = useAppUpdateStore((state) => state.availableVersion);
  const notes = useAppUpdateStore((state) => state.notes);
  const progress = useAppUpdateStore((state) => state.progress);
  const error = useAppUpdateStore((state) => state.error);
  const autoUpdate = useAppUpdateStore((state) => state.autoUpdate);
  const loadVersion = useAppUpdateStore((state) => state.loadVersion);
  const checkNow = useAppUpdateStore((state) => state.checkNow);
  const download = useAppUpdateStore((state) => state.download);
  const restart = useAppUpdateStore((state) => state.restart);
  const setAutoUpdate = useAppUpdateStore((state) => state.setAutoUpdate);

  useEffect(() => {
    void loadVersion();
  }, [loadVersion]);

  if (!isDesktop()) {
    return <ServerUpdateSection />;
  }
  const showUpdateCard =
    availableVersion !== null &&
    (status === 'available' || status === 'downloading' || status === 'ready');
  return (
    <FieldGroup className="gap-6">
      <Field>
        <FieldLabel>Current version</FieldLabel>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="font-mono text-xs">
            v{currentVersion ?? '…'}
          </Badge>
          <button
            type="button"
            className="flex cursor-pointer items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
            data-testid="update-release-notes"
            onClick={() => void openReleaseNotes(currentVersion)}
          >
            Release notes
            <ExternalLinkIcon className="size-3" />
          </button>
        </div>
      </Field>
      {showUpdateCard ? (
        <Field data-testid="update-card">
          <div className="flex items-center gap-2">
            <FieldLabel>Harnesys v{availableVersion}</FieldLabel>
            <Badge variant="outline" className="text-[10px]">
              {status === 'ready' ? 'Downloaded' : 'New version'}
            </Badge>
          </div>
          {notes ? (
            <div className="max-h-64 overflow-y-auto rounded-md border bg-muted/30 p-3">
              <Markdown text={notes} className="text-sm" />
            </div>
          ) : null}
          {status === 'downloading' ? (
            <Progress value={progress === null ? null : Math.round(progress * 100)} />
          ) : null}
          <UpdateCardFooter status={status} onDownload={download} onRestart={restart} />
        </Field>
      ) : null}
      <Field>
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor="auto-update">Auto update</FieldLabel>
            <FieldDescription>
              Check for updates on startup. Installing always asks first.
            </FieldDescription>
          </div>
          <Switch
            id="auto-update"
            checked={autoUpdate}
            onCheckedChange={(checked) => setAutoUpdate(checked)}
            data-testid="auto-update"
          />
        </div>
      </Field>
      <Field>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            disabled={status === 'checking' || status === 'downloading'}
            onClick={() => void checkNow()}
            data-testid="update-check"
          >
            {status === 'checking' ? 'Checking…' : 'Check for updates'}
          </Button>
          {status === 'up-to-date' ? (
            <FieldDescription data-testid="update-status">
              You are on the latest version.
            </FieldDescription>
          ) : null}
          {status === 'error' ? (
            <FieldDescription className="text-destructive" data-testid="update-status">
              {error}
            </FieldDescription>
          ) : null}
        </div>
      </Field>
    </FieldGroup>
  );
}

function UpdateCardFooter({
  status,
  onDownload,
  onRestart,
}: {
  status: 'available' | 'downloading' | 'ready';
  onDownload: () => Promise<void>;
  onRestart: () => Promise<void>;
}) {
  if (status === 'ready') {
    return (
      <div className="flex items-center gap-3">
        <Button onClick={() => void onRestart()} data-testid="update-restart">
          Restart to update
        </Button>
        <FieldDescription>The update is installed and applies on restart.</FieldDescription>
      </div>
    );
  }
  if (status === 'downloading') {
    return null;
  }
  return (
    <div>
      <Button onClick={() => void onDownload()} data-testid="update-install">
        Update
      </Button>
    </div>
  );
}

/**
 * Server installs (VPS / Docker) have no in-app updater: the section reports
 * the host version and the latest GitHub release; installation stays with the
 * operator (`docker compose pull` or `harnesys update`).
 */
function ServerUpdateSection() {
  const meta = useQuery(appMetaQuery);
  const latest = useQuery(latestReleaseQuery);
  const current = meta.data?.version ?? null;
  const available = latest.data;
  const hasUpdate =
    typeof current === 'string' && typeof available === 'string' && isNewerVersion(current, available);

  return (
    <FieldGroup className="gap-6">
      <Field>
        <FieldLabel>Current version</FieldLabel>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="font-mono text-xs">
            v{current ?? '…'}
          </Badge>
          <button
            type="button"
            className="flex cursor-pointer items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
            data-testid="update-release-notes"
            onClick={() => {
              window.open(releasePageUrl(hasUpdate ? available : current), '_blank', 'noreferrer');
            }}
          >
            Release notes
            <ExternalLinkIcon className="size-3" />
          </button>
        </div>
      </Field>
      {hasUpdate ? (
        <Field data-testid="server-update-card">
          <div className="flex items-center gap-2">
            <FieldLabel>Harnesys v{available}</FieldLabel>
            <Badge variant="outline" className="text-[10px]">
              New version
            </Badge>
          </div>
          <FieldDescription>
            Server installs update outside the app: run `docker compose pull && docker compose up
            -d` or `harnesys update` on the host.
          </FieldDescription>
        </Field>
      ) : null}
      <Field>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            disabled={latest.isFetching}
            onClick={() => void latest.refetch()}
            data-testid="update-check"
          >
            {latest.isFetching ? 'Checking…' : 'Check for updates'}
          </Button>
          {latest.isError ? (
            <FieldDescription data-testid="update-status">
              Could not reach GitHub Releases.
            </FieldDescription>
          ) : null}
          {!latest.isFetching && !latest.isError && !hasUpdate && available !== null ? (
            <FieldDescription data-testid="update-status">
              You are on the latest version.
            </FieldDescription>
          ) : null}
        </div>
      </Field>
    </FieldGroup>
  );
}
