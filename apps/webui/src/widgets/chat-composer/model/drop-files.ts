import { toast } from '@/shared/ui/toast';

const MAX_DROPPED_FILES = 200;

function entryFile(entry: FileSystemFileEntry): Promise<File | null> {
  return new Promise((resolve) => {
    entry.file(
      (file) => resolve(file),
      () => resolve(null),
    );
  });
}

async function readDir(entry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = entry.createReader();
  const out: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve) => {
      reader.readEntries(
        (entries) => resolve(entries),
        () => resolve([]),
      );
    });
    if (batch.length === 0) {
      return out;
    }
    out.push(...batch);
  }
}

async function collect(entry: FileSystemEntry, prefix: string, out: File[]): Promise<void> {
  if (out.length >= MAX_DROPPED_FILES) {
    return;
  }
  if (entry.isFile) {
    const file = await entryFile(entry as FileSystemFileEntry);
    if (!file) {
      return;
    }
    const name = prefix ? `${prefix}_${file.name}` : file.name;
    out.push(new File([file], name, { type: file.type, lastModified: file.lastModified }));
    return;
  }
  if (entry.isDirectory) {
    const children = await readDir(entry as FileSystemDirectoryEntry);
    const nextPrefix = prefix ? `${prefix}_${entry.name}` : entry.name;
    for (const child of children) {
      await collect(child, nextPrefix, out);
    }
  }
}

export async function filesFromEntries(entries: FileSystemEntry[], files: File[]): Promise<File[]> {
  if (entries.length === 0) {
    return files;
  }
  const out: File[] = [];
  for (const entry of entries) {
    await collect(entry, '', out);
  }
  if (out.length >= MAX_DROPPED_FILES) {
    toast.add({ title: `Attached first ${MAX_DROPPED_FILES} files from the drop` });
    return out.slice(0, MAX_DROPPED_FILES);
  }
  return out;
}
