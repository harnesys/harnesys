import { DownloadIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fileExtLabel, formatBytes } from '@/shared/lib/file-meta';
import { cn } from '@/shared/lib/utils';
import { FileTypeIcon } from '@/shared/ui/icons';

const PREVIEW_CHARS = 1200;
const DOWNLOAD_URL_TTL_MS = 30000;

export function useBlobTextPreview(url: string | null): string | null {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!url) {
      setText(null);
      return;
    }
    let alive = true;
    void fetch(url)
      .then((response) => response.text())
      .then((value) => {
        if (alive) {
          setText(value.slice(0, PREVIEW_CHARS));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url]);
  return text;
}

export interface AttachmentTileProps {
  name: string;
  mediaType: string;
  bytes?: number;
  thumb?: string | null;
  preview?: string | null;
  href?: string;
  load?: (signal: AbortSignal) => Promise<Blob>;
  onOpen?: () => void;
}

export function AttachmentTile({
  name,
  mediaType,
  bytes,
  thumb,
  preview,
  href,
  load,
  onOpen,
}: AttachmentTileProps) {
  const meta = bytes && bytes > 0 ? formatBytes(bytes) : null;
  const ext = fileExtLabel(name, mediaType);
  function download() {
    if (href) {
      triggerDownload(href, name);
      return;
    }
    if (!load) {
      return;
    }
    void load(new AbortController().signal)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        triggerDownload(url, name);
        setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_TTL_MS);
      })
      .catch(() => {});
  }
  return (
    <div
      className={cn(
        'group/attachment relative flex size-28 shrink-0 flex-col overflow-hidden rounded-xl bg-muted/40',
        'transition-colors focus-within:bg-muted/60 hover:bg-muted/60',
      )}
    >
      <div className="pointer-events-none px-2 pt-1.5">
        <span
          className="line-clamp-2 block font-medium text-[11px] text-foreground leading-tight"
          title={name}
        >
          {name}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-2 py-1">
        {thumb ? (
          <img src={thumb} alt="" className="size-full rounded-md object-cover" />
        ) : preview != null ? (
          <pre className="h-full overflow-hidden whitespace-pre-wrap break-words font-mono text-[8px] text-muted-foreground leading-3 [mask-image:linear-gradient(to_bottom,black_60%,transparent)]">
            {preview}
          </pre>
        ) : (
          <div className="flex size-full items-center justify-center">
            <FileTypeIcon name={name} mediaType={mediaType} size="lg" />
          </div>
        )}
      </div>
      <div className="pointer-events-none flex items-center px-2 pb-1.5">
        <span className="rounded-full bg-foreground/10 px-1.5 py-0.5 font-semibold text-[8px] text-foreground/80">
          {ext}
        </span>
        {meta || href || load ? (
          <div className="relative ml-auto flex h-5 min-w-5 items-center justify-end">
            {meta ? (
              <span
                className="px-1 text-[9px] text-muted-foreground tabular-nums transition-opacity group-hover/attachment:opacity-0"
                title={`Size: ${meta}`}
              >
                {meta}
              </span>
            ) : null}
            {href || load ? (
              <button
                type="button"
                onClick={download}
                aria-label={`Download ${name}`}
                title={`Download ${name}`}
                className={cn(
                  'pointer-events-auto grid size-5 place-items-center rounded-md opacity-0 transition-opacity',
                  'text-muted-foreground hover:text-foreground focus-visible:opacity-100',
                  'group-hover/attachment:opacity-100',
                  meta && 'absolute inset-0 ms-auto',
                )}
              >
                <DownloadIcon className="size-3" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${name}`}
          className="absolute inset-0 z-10 cursor-pointer rounded-xl outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
        />
      ) : null}
    </div>
  );
}

function triggerDownload(url: string, name: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
}
