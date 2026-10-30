import { useState } from 'react';
import { FolderBrowserDialog } from '@/features/create-project/ui/folder-browser-dialog.tsx';
import { createOrg, type MachineOrgEntry } from '@/shared/api/orgs';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  CHOOSE_BACK,
  CREATE_NAME_HINT,
  CREATE_NAME_LABEL,
  CREATE_PANEL_BODY,
  CREATE_PANEL_TITLE,
  CREATE_SUBMIT,
  CREATE_WORKSPACE_HINT,
  CREATE_WORKSPACE_LABEL,
} from '../model/onboarding-copy';
import { OnboardingShell } from './onboarding-shell';

export function OnboardingCreatePanel({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (entry: MachineOrgEntry) => void;
}) {
  const [name, setName] = useState('');
  const [workspacePath, setWorkspacePath] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    const folder = workspacePath.trim();
    setBusy(true);
    setError(null);
    try {
      const entry = await createOrg({
        name: trimmed,
        ...(folder ? { workspacePath: folder } : {}),
      });
      onCreated(entry);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingShell testId="onboarding-create">
      <div className="mx-auto w-full max-w-lg">
        <button
          type="button"
          onClick={onBack}
          className="mb-8 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          data-testid="onboarding-back"
        >
          ← {CHOOSE_BACK}
        </button>
        <h1 className="font-semibold text-2xl tracking-[-0.03em] sm:text-3xl">
          {CREATE_PANEL_TITLE}
        </h1>
        <p className="mt-3 text-muted-foreground text-sm leading-relaxed">{CREATE_PANEL_BODY}</p>
        <form
          className="mt-8 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="onboarding-org-name">{CREATE_NAME_LABEL}</Label>
            <Input
              id="onboarding-org-name"
              value={name}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              placeholder="Studio"
              data-testid="create-org-name"
            />
            <p className="text-muted-foreground text-xs">{CREATE_NAME_HINT}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="onboarding-org-workspace">{CREATE_WORKSPACE_LABEL}</Label>
            <div className="flex gap-2">
              <Input
                id="onboarding-org-workspace"
                value={workspacePath}
                onChange={(event) => setWorkspacePath(event.target.value)}
                placeholder="/absolute/path/on/this/host"
                data-testid="create-org-workspace"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setBrowsing(true)}
                data-testid="create-org-browse"
              >
                Browse…
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">{CREATE_WORKSPACE_HINT}</p>
          </div>
          {browsing ? (
            <FolderBrowserDialog
              orgId="local"
              onResolve={(folder) => {
                setBrowsing(false);
                if (folder) {
                  setWorkspacePath(folder);
                }
              }}
            />
          ) : null}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <Button type="submit" size="lg" disabled={busy} data-testid="create-org-submit">
            {busy ? 'Creating…' : CREATE_SUBMIT}
          </Button>
        </form>
      </div>
    </OnboardingShell>
  );
}
