export const FILE_REF_MIME = 'application/x-harnesys-file-ref';

export interface FileRefDrag {
  sourceId: string;
  ref: string;

  relPath: string;
}

export function setFileRefDrag(dataTransfer: DataTransfer, payload: FileRefDrag): void {
  dataTransfer.setData(FILE_REF_MIME, JSON.stringify(payload));
}

export function parseFileRefDrag(dataTransfer: DataTransfer): FileRefDrag | null {
  const raw = dataTransfer.getData(FILE_REF_MIME);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<FileRefDrag>;
    if (typeof parsed.sourceId === 'string' && typeof parsed.ref === 'string' && parsed.ref) {
      return {
        sourceId: parsed.sourceId,
        ref: parsed.ref,
        relPath: typeof parsed.relPath === 'string' ? parsed.relPath : '',
      };
    }
  } catch {
    return null;
  }
  return null;
}
