import type { InstallPlan } from '@harnesys/contracts';
import type { DragEvent, KeyboardEvent } from 'react';
import { useRef, useState } from 'react';
import {
  confirmAddonInstall,
  planAddonInstall,
  uploadAddonPackage,
} from '@/shared/api/addon-packages';
import { formatBytes } from '@/shared/lib/file-meta';
import { cn } from '@/shared/lib/utils';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';
import { FolderBrowserDialog } from '@/widgets/folder-browser';
import { PermissionRow } from './consent-rows';

const MAX_PACKAGE_BYTES = 32 * 1024 * 1024;

export interface InstallAddonDialogData {
  source?: string;
}

export function InstallAddonDialog({
  onResolve,
  data,
}: DialogComponentProps<boolean, InstallAddonDialogData>) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState(data?.source ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [plan, setPlan] = useState<InstallPlan | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickFile = (next: File | null | undefined) => {
    setPlan(null);
    setFileError(null);
    if (!next) {
      return;
    }
    if (!next.name.toLowerCase().endsWith('.zip')) {
      setFileError('Only .zip packages are supported');
      return;
    }
    if (next.size > MAX_PACKAGE_BYTES) {
      setFileError('Package exceeds the 32 MiB upload limit');
      return;
    }
    setFile(next);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    pickFile(event.dataTransfer.files?.[0]);
  };

  const handleDropKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.current?.click();
    }
  };

  const selectFolder = (path?: string) => {
    setBrowsing(false);
    if (path === undefined) {
      return;
    }
    setFile(null);
    setFileError(null);
    setPlan(null);
    setSource(path);
  };

  const resetSelection = () => {
    setPlan(null);
    setFile(null);
    setFileError(null);
    setSource('');
    setError(null);
  };

  const startPlan = async () => {
    setPending(true);
    setError(null);
    setPlan(null);
    try {
      setPlan(file ? await uploadAddonPackage(file) : await planAddonInstall({ source }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  const confirmPlan = async () => {
    if (!plan) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await confirmAddonInstall(plan.planId);
      toast.add({ type: 'success', title: `${plan.id}@${plan.version} installed` });
      onResolve?.(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error ? <SettingsErrorBanner message={error} testId="install-addon-error" /> : null}
      {plan ? (
        <div
          className="flex flex-col gap-2 rounded-md border px-3 py-2"
          data-testid="install-addon-plan"
        >
          <p className="font-medium text-sm">
            {plan.id}@{plan.version} — {plan.trust}
          </p>
          {plan.warnings.map((warning) => (
            <p key={warning} className="text-status-warn text-xs">
              {warning}
            </p>
          ))}
          {plan.permissions.map((permission) => (
            <PermissionRow key={permission.id} permission={permission} />
          ))}
        </div>
      ) : (
        <>
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload add-on package"
            onClick={() => fileInput.current?.click()}
            onKeyDown={handleDropKeys}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={cn(
              'flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 py-5 text-center focus-visible:outline-1 focus-visible:outline-ring',
              dragging && 'border-primary bg-muted/40',
            )}
          >
            <p className="font-medium text-sm">
              Drop a .zip package here, or click to choose a file
            </p>
            <p className="text-muted-foreground text-xs">Up to 32 MiB</p>
            {file ? (
              <p className="truncate font-mono text-xs">
                {file.name} · {formatBytes(file.size)}
              </p>
            ) : null}
            {fileError ? <p className="text-destructive text-xs">{fileError}</p> : null}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(event) => {
              pickFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <Button variant="outline" size="sm" onClick={() => setBrowsing(true)}>
            Browse folder on host
          </Button>
          <Field>
            <FieldLabel htmlFor="install-addon-source">Package path or URL</FieldLabel>
            <Input
              id="install-addon-source"
              className="font-mono text-xs"
              placeholder="/path/to/add-on or https://github.com/org/repo"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              data-testid="install-addon-source"
            />
          </Field>
        </>
      )}
      {browsing ? <FolderBrowserDialog onResolve={selectFolder} /> : null}
      <DialogFooter>
        <Button variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        {plan ? (
          <>
            <Button variant="ghost" onClick={resetSelection}>
              Install another
            </Button>
            <Button
              disabled={pending}
              onClick={() => void confirmPlan()}
              data-testid="install-addon-confirm"
            >
              Install
            </Button>
          </>
        ) : (
          <Button
            disabled={pending || (!file && !source)}
            onClick={() => void startPlan()}
            data-testid="install-addon-plan"
          >
            {pending ? (file ? 'Uploading...' : 'Scanning...') : 'Review package'}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}
