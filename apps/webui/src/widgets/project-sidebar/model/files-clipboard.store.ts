export interface FilesClipboard {
  projectId: string;
  paths: string[];
}

let clipboard: FilesClipboard | null = null;

export function setFilesClipboard(next: FilesClipboard | null): void {
  clipboard = next;
}

export function filesClipboard(): FilesClipboard | null {
  return clipboard;
}
