import { CheckIcon, CopyIcon, DownloadIcon } from 'lucide-react';
import { useState } from 'react';
import type { ToolEventPair } from '@/entities/session';
import { openThreadFileTab } from '@/features/ide';
import { loadThreadAttachment } from '@/shared/api';
import { useAuthedBlobUrl } from '@/shared/api/blob-url';
import { cn } from '@/shared/lib/utils';
import { asObject, parseJson, str } from '../model/tool-json';

export interface ImageArtifactInfo {
  attachmentId: string;
  name: string;
  mediaType: string;
}

export function parseImageArtifact(pair: ToolEventPair): ImageArtifactInfo | null {
  const result = pair.result;
  if (result?.phase !== 'completed' || pair.call.name !== 'image_generate') {
    return null;
  }
  const output = typeof result.output === 'string' ? parseJson(result.output) : result.output;
  const obj = asObject(output);
  const attachmentId = str(obj, 'attachmentId');
  const mediaType = str(obj, 'mediaType');
  if (!obj || !attachmentId || !mediaType) {
    return null;
  }
  return { attachmentId, name: str(obj, 'name') ?? attachmentId, mediaType };
}

const COPY_FLASH_MS = 1500;

async function pngBlobOf(source: Blob): Promise<Blob> {
  if (source.type === 'image/png') {
    return source;
  }
  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('canvas 2d context unavailable');
  }
  ctx.drawImage(bitmap, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('canvas toBlob failed'));
      }
    }, 'image/png');
  });
}

export function ImageArtifact({
  threadId,
  attachmentId,
  name,
  mediaType,
}: {
  threadId: string;
  attachmentId: string;
  name: string;
  mediaType: string;
}) {
  const { url, error } = useAuthedBlobUrl(
    () => loadThreadAttachment(threadId, attachmentId),
    `${threadId}:${attachmentId}`,
  );
  const [copied, setCopied] = useState(false);
  const [imageCopied, setImageCopied] = useState(false);
  if (error) {
    return <div className="text-muted-foreground text-xs">Failed to load image</div>;
  }
  if (!url) {
    return <div className="h-48 w-72 max-w-full animate-pulse rounded-lg border bg-muted/40" />;
  }
  const flash = (set: (value: boolean) => void): void => {
    set(true);
    setTimeout(() => set(false), COPY_FLASH_MS);
  };
  const copyName = (): void => {
    void navigator.clipboard.writeText(name);
    flash(setCopied);
  };
  const copyImage = (): void => {
    void (async () => {
      const source = await fetch(url).then((response) => response.blob());
      const blob = await pngBlobOf(source);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      flash(setImageCopied);
    })();
  };
  return (
    <div className="group relative inline-flex max-w-full">
      <button
        type="button"
        aria-label={`Open ${name}`}
        className="cursor-zoom-in"
        onClick={() => openThreadFileTab(threadId, name, attachmentId, mediaType)}
      >
        <img src={url} alt={name} className="max-h-80 max-w-sm rounded-lg border" />
      </button>
      <div className="pointer-events-none absolute right-2 bottom-2 flex items-center gap-1 rounded-lg bg-black/55 p-0.5 opacity-0 backdrop-blur-sm transition-opacity duration-150 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
        <button
          type="button"
          title="Copy image name"
          onClick={copyName}
          className={cn(
            'inline-flex h-5 min-w-0 max-w-56 items-center gap-1 rounded border border-white/25 px-1.5',
            'font-mono text-[10px] text-white/85 transition-colors hover:border-white/40 hover:text-white',
            copied && 'text-status-ok',
          )}
        >
          {copied ? (
            <CheckIcon className="size-3 shrink-0 text-status-ok" />
          ) : (
            <CopyIcon className="size-3 shrink-0 opacity-70" />
          )}
          <span className="truncate">{name}</span>
        </button>
        <button
          type="button"
          title="Copy image to clipboard"
          onClick={copyImage}
          className={cn(
            'inline-flex size-5 items-center justify-center rounded border border-white/25',
            'text-white/85 transition-colors hover:border-white/40 hover:text-white',
            imageCopied && 'text-status-ok',
          )}
        >
          {imageCopied ? (
            <CheckIcon className="size-3 text-status-ok" />
          ) : (
            <CopyIcon className="size-3" />
          )}
        </button>
        <a
          href={url}
          download={name}
          title="Download image"
          className={cn(
            'inline-flex size-5 items-center justify-center rounded border border-white/25',
            'text-white/85 transition-colors hover:border-white/40 hover:text-white',
          )}
        >
          <DownloadIcon className="size-3" />
        </a>
      </div>
    </div>
  );
}
