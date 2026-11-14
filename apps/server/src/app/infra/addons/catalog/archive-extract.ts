import { type UnzipFileInfo, unzipSync } from 'fflate';

export const ARCHIVE_MAX_ENTRIES = 5000;
export const ARCHIVE_MAX_DECOMPRESSED_BYTES = 128 * 1024 * 1024;

export interface ArchiveLimits {
  maxEntries: number;
  maxDecompressedBytes: number;
}

export type ArchiveFileSink = (name: string, data: Uint8Array) => void;

const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = {
  maxEntries: ARCHIVE_MAX_ENTRIES,
  maxDecompressedBytes: ARCHIVE_MAX_DECOMPRESSED_BYTES,
};

/** Zip-slip guard: absolute paths and `..` segments escape the extraction root. */
export function isUnsafeArchiveEntry(name: string): boolean {
  if (name.startsWith('/') || name.startsWith('\\')) {
    return true;
  }
  const drive = name.slice(0, 2);
  if (drive[1] === ':' && drive[0] !== undefined && /^[a-zA-Z]$/.test(drive[0])) {
    return true;
  }
  return name.split(/[\\/]/).includes('..');
}

/**
 * If the zip has no `addon.json` at root but exactly one top-level directory
 * containing one, that directory is the payload root (macOS/Windows "zip folder").
 */
export function unwrapArchiveRoot(names: readonly string[]): string | null {
  if (names.includes('addon.json')) {
    return null;
  }
  const wrappers = new Set<string>();
  for (const name of names) {
    const slash = name.indexOf('/');
    if (slash > 0 && name.slice(slash + 1) === 'addon.json') {
      wrappers.add(name.slice(0, slash));
    }
  }
  if (wrappers.size !== 1) {
    return null;
  }
  const [wrapper] = wrappers;
  return wrapper === undefined ? null : wrapper;
}

/**
 * Extracts a zip through the given sink, enforcing entry-count and
 * decompressed-size caps before any entry is inflated (declared sizes from the
 * central directory), then re-checking the actual total before writing.
 * Returns the archive entry names.
 */
export function extractZipArchive(
  bytes: Uint8Array,
  sink: ArchiveFileSink,
  limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
): string[] {
  const names: string[] = [];
  let declaredTotal = 0;
  const files = unzipSync(bytes, {
    filter: (file: UnzipFileInfo) => {
      if (isUnsafeArchiveEntry(file.name)) {
        throw new Error(`unsafe archive entry: ${file.name}`);
      }
      names.push(file.name);
      if (names.length > limits.maxEntries) {
        throw new Error(`archive has too many entries: ${names.length} > ${limits.maxEntries}`);
      }
      declaredTotal += file.originalSize;
      if (declaredTotal > limits.maxDecompressedBytes) {
        throw new Error(`archive decompressed size exceeds ${limits.maxDecompressedBytes} bytes`);
      }
      return true;
    },
  });
  let actualTotal = 0;
  for (const name of names) {
    actualTotal += files[name]?.byteLength ?? 0;
  }
  if (actualTotal > limits.maxDecompressedBytes) {
    throw new Error(`archive decompressed size exceeds ${limits.maxDecompressedBytes} bytes`);
  }
  for (const name of names) {
    const data = files[name];
    if (data) {
      sink(name, data);
    }
  }
  return names;
}
