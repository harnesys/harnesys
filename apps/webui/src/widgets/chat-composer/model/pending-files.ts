const pendingFiles = new Map<string, File>();

export function putPendingFile(token: string, file: File): void {
  pendingFiles.set(token, file);
}

export function getPendingFile(token: string): File | undefined {
  return pendingFiles.get(token);
}

export function prunePendingFiles(keep: readonly string[]): void {
  const kept = new Set(keep);
  for (const token of pendingFiles.keys()) {
    if (!kept.has(token)) {
      pendingFiles.delete(token);
    }
  }
}
