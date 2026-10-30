import { useQuery } from '@tanstack/react-query';
import { ExternalLinkIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useParams } from 'react-router';
import { appMetaQuery } from '@/shared/api';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Markdown } from '@/shared/ui/markdown';
import { Progress } from '@/shared/ui/progress';
import { Switch } from '@/shared/ui/switch';
import { isDesktop, openReleaseNotes } from '../model/app-update';
import { useAppUpdateStore } from '../model/app-update.store';
import { findRelease, isNewerVersion, releasePageUrl, releasesQuery } from '../model/server-update';

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
      <CurrentReleaseNotes version={currentVersion} />
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
 * the host version, what shipped in it, and what ships next; installation
 * stays with the operator (`docker compose pull` or `harnesys update`).
 */
function ServerUpdateSection() {
  const { orgId } = useParams();
  const meta = useQuery(appMetaQuery(orgId));
  const releases = useQuery(releasesQuery);
  const current = meta.data?.version ?? null;
  const latest = releases.data?.[0] ?? null;
  const currentRelease = current !== null ? findRelease(releases.data ?? [], current) : null;
  const hasUpdate =
    typeof current === 'string' &&
    typeof latest?.version === 'string' &&
    isNewerVersion(current, latest.version);

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
              window.open(
                releasePageUrl(hasUpdate ? latest.version : current),
                '_blank',
                'noreferrer',
              );
            }}
          >
            Release notes
            <ExternalLinkIcon className="size-3" />
          </button>
        </div>
      </Field>
      {currentRelease?.notes ? (
        <Field data-testid="current-release-notes">
          <FieldLabel>What's in v{currentRelease.version}</FieldLabel>
          <ReleaseNotes notes={currentRelease.notes} />
        </Field>
      ) : null}
      {hasUpdate && latest ? (
        <Field data-testid="server-update-card">
          <div className="flex items-center gap-2">
            <FieldLabel>Harnesys v{latest.version}</FieldLabel>
            <Badge variant="outline" className="text-[10px]">
              New version
            </Badge>
          </div>
          <ReleaseNotes notes={latest.notes} />
          <FieldDescription>
            Server installs update outside the app: `docker compose pull && docker compose up -d` or
            `harnesys update` on the host.
          </FieldDescription>
        </Field>
      ) : null}
      <Field>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            disabled={releases.isFetching}
            onClick={() => void releases.refetch()}
            data-testid="update-check"
          >
            {releases.isFetching ? 'Checking…' : 'Check for updates'}
          </Button>
          {releases.data !== undefined && releases.data.length === 0 ? (
            <FieldDescription data-testid="update-status">
              Could not reach GitHub Releases.
            </FieldDescription>
          ) : null}
          {!releases.isFetching && !hasUpdate && latest ? (
            <FieldDescription data-testid="update-status">
              You are on the latest version.
            </FieldDescription>
          ) : null}
        </div>
      </Field>
    </FieldGroup>
  );
}

function CurrentReleaseNotes({ version }: { version: string | null }) {
  const releases = useQuery(releasesQuery);
  const currentRelease = version !== null ? findRelease(releases.data ?? [], version) : null;
  if (!currentRelease?.notes) {
    return null;
  }
  return (
    <Field data-testid="current-release-notes">
      <FieldLabel>What's in v{currentRelease.version}</FieldLabel>
      <ReleaseNotes notes={currentRelease.notes} />
    </Field>
  );
}

function ReleaseNotes({ notes }: { notes: string | null }) {
  if (!notes) {
    return (
      <FieldDescription className="text-muted-foreground">
        No release notes for this version.
      </FieldDescription>
    );
  }
  return (
    <div className="max-h-64 overflow-y-auto rounded-md border bg-muted/30 p-3">
      <Markdown text={notes} className="text-sm" />
    </div>
  );
}
