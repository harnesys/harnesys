import type { GitCommitDetail } from '@harnesys/studio-shared';
import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  GitBranchIcon,
  Loader2Icon,
  RotateCcwIcon,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button, buttonVariants } from '@/shared/ui/button';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { toast } from '@/shared/ui/toast';
import { refLabel, statusColor, statusLabel } from '../model/source-control';
import { SourceControlPatch } from './source-control-patch';

interface SourceControlHistoryDetailProps {
  detail: GitCommitDetail;
  patch: string;
  remoteUrl: string | null;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  onRevert: () => void;
  onBranchFrom: () => void;
}

export function SourceControlHistoryDetail({
  detail,
  patch,
  remoteUrl,
  selectedFile,
  onSelectFile,
  onRevert,
  onBranchFrom,
}: SourceControlHistoryDetailProps) {
  const { commit, files, body, truncated } = detail;
  const added = files.reduce((sum, file) => sum + file.added, 0);
  const deleted = files.reduce((sum, file) => sum + file.deleted, 0);
  const copySha = () => {
    void navigator.clipboard
      .writeText(commit.sha)
      .then(() => toast.add({ title: 'SHA copied' }))
      .catch(() => toast.add({ title: 'Copy failed' }));
  };
  return (
    <>
      <div className="flex shrink-0 flex-col gap-1 border-b px-3 py-2">
        <div className="flex flex-wrap items-start gap-2">
          <h3 className="min-w-0 flex-1 truncate font-medium text-sm" title={commit.subject}>
            {commit.subject}
          </h3>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-0.5">
            <Button type="button" variant="ghost" size="sm" onClick={copySha} title="Copy SHA">
              <CopyIcon />
              SHA
            </Button>
            {remoteUrl ? (
              <a
                href={remoteUrl}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'no-underline')}
                title="Open commit on remote"
              >
                <ExternalLinkIcon />
                Remote
              </a>
            ) : null}
            <Button type="button" variant="ghost" size="sm" onClick={onBranchFrom}>
              <GitBranchIcon />
              Branch
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onRevert}>
              <RotateCcwIcon />
              Revert…
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span className="font-mono">{commit.shortSha}</span>
          <span>{commit.author.name}</span>
          <span>{new Date(commit.date).toLocaleString()}</span>
          {commit.refs.map((ref) => (
            <span key={ref} className="rounded bg-muted px-1 font-mono text-[9px]">
              {refLabel(ref)}
            </span>
          ))}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {files.length} {files.length === 1 ? 'file' : 'files'} changed{' '}
          <span className="text-status-ok">+{added}</span>{' '}
          <span className="text-destructive">−{deleted}</span>
        </div>
      </div>
      {body ? (
        <div className="max-h-24 shrink-0 overflow-y-auto border-b px-3 py-2 text-xs">
          <pre className="whitespace-pre-wrap font-sans text-muted-foreground">{body}</pre>
        </div>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="w-[260px] shrink-0 overflow-y-auto border-r">
          <ul className="flex flex-col p-1">
            {files.map((file) => (
              <li key={file.path}>
                <button
                  type="button"
                  onClick={() => onSelectFile(file.path)}
                  className={cn(
                    'flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs',
                    selectedFile === file.path ? 'bg-muted' : 'hover:bg-muted/60',
                  )}
                >
                  <span className={cn('w-3 font-mono text-[10px]', statusColor(file.status))}>
                    {statusLabel(file.status)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{file.path}</span>
                  <span className="shrink-0 font-mono text-[10px] text-status-ok">
                    +{file.added}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-destructive">
                    −{file.deleted}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <ScrollArea className="min-h-0 min-w-0 flex-1" horizontal>
          {truncated ? (
            <div className="border-b bg-muted/30 px-3 py-1 text-[10px] text-muted-foreground">
              Patch truncated
            </div>
          ) : null}
          <SourceControlPatch patch={patch} />
        </ScrollArea>
      </div>
    </>
  );
}

export function RevertCommitConfirm({
  sha,
  pending,
  onCancel,
  onConfirm,
}: {
  sha: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex w-full max-w-sm flex-col gap-3 rounded-xl border bg-popover p-4 shadow-lg">
      <div className="flex flex-col gap-1">
        <h3 className="font-medium text-sm">Revert commit {sha.slice(0, 7)}?</h3>
        <p className="text-muted-foreground text-xs">
          This creates a new commit that undoes the selected change.
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" variant="destructive" onClick={onConfirm} disabled={pending}>
          {pending ? <Loader2Icon className="size-3.5 animate-spin" /> : <CheckIcon />}
          Revert commit
        </Button>
      </div>
    </div>
  );
}
