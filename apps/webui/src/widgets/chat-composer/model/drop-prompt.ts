import type { FileRefDrag } from '@/shared/lib/file-ref-drag';
import { filesFromEntries } from './drop-files';

export interface DropLink {
  ref: string;
  href: string;
}
export interface DropTarget {
  name: string;
  abs: string | null;

  label?: string;
  sourceId?: string;
  relPath?: string;
}
export interface ComposerDropPrompt {
  targets: DropTarget[];
  files: File[];
  entries: FileSystemEntry[];
  at: number | null;
  onlyDirectories: boolean;
  directoryCount: number;
}

export function captureComposerDrop(
  dataTransfer: DataTransfer,
  at: number | null,
): ComposerDropPrompt | null {
  const entries = Array.from(dataTransfer.items ?? [])
    .map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
    .filter((entry): entry is FileSystemEntry => entry !== null);
  const files = Array.from(dataTransfer.files ?? []);
  const absPaths = uriListAbsPaths(dataTransfer);
  const targets: DropTarget[] =
    entries.length > 0
      ? entries.map((entry, index) => ({ name: entry.name, abs: absPaths[index] ?? null }))
      : files.map((file, index) => ({ name: file.name, abs: absPaths[index] ?? null }));
  if (targets.length === 0) {
    return null;
  }
  return {
    targets,
    files,
    entries,
    at,
    onlyDirectories: entries.length > 0 && entries.every((entry) => entry.isDirectory),
    directoryCount: entries.filter((entry) => entry.isDirectory).length,
  };
}

export function refDropPrompt(drag: FileRefDrag, at: number | null): ComposerDropPrompt {
  return {
    targets: [
      {
        name: drag.ref,
        abs: null,
        label: basename(drag.ref),
        sourceId: drag.sourceId,
        relPath: drag.relPath,
      },
    ],
    files: [],
    entries: [],
    at,
    onlyDirectories: false,
    directoryCount: 0,
  };
}

export function promptLinksReady(prompt: ComposerDropPrompt): boolean {
  return prompt.targets.every(
    (target) => Boolean(target.abs) || Boolean(target.sourceId && target.relPath),
  );
}

export function linksFromPrompt(prompt: ComposerDropPrompt): DropLink[] {
  return prompt.targets.map((target) => ({
    ref: target.label ?? (target.abs ? basename(target.abs) : target.name),
    href: target.abs ?? '',
  }));
}

export type SourceRootFetcher = (sourceId: string) => Promise<string>;

export async function resolvePromptLinks(
  prompt: ComposerDropPrompt,
  fetchRoot: SourceRootFetcher,
): Promise<DropLink[]> {
  const links: DropLink[] = [];
  for (const target of prompt.targets) {
    const abs = target.abs ?? (await resolveSidebarAbs(target, fetchRoot));
    links.push({ ref: target.label ?? (abs ? basename(abs) : target.name), href: abs ?? '' });
  }
  return links;
}

async function resolveSidebarAbs(
  target: DropTarget,
  fetchRoot: SourceRootFetcher,
): Promise<string | null> {
  if (!target.sourceId || !target.relPath) {
    return null;
  }
  return joinPath(await fetchRoot(target.sourceId), target.relPath);
}

function joinPath(root: string, relPath: string): string {
  return root.endsWith('/') ? `${root}${relPath}` : `${root}/${relPath}`;
}

export function filesFromPrompt(prompt: ComposerDropPrompt): Promise<File[]> {
  return filesFromEntries(prompt.entries, prompt.files);
}

function uriListAbsPaths(dataTransfer: DataTransfer): (string | null)[] {
  return dataTransfer
    .getData('text/uri-list')
    .split(/\r?\n/)
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map(fileUrlToAbs);
}

function fileUrlToAbs(url: string): string | null {
  if (!url.startsWith('file://')) {
    return null;
  }
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return null;
  }
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
