export const TERMINAL_REF_MIME = 'application/x-harnesys-terminal-ref';

export interface TerminalRefDrag {
  id: string;
  name: string;
}

export function setTerminalRefDrag(dataTransfer: DataTransfer, payload: TerminalRefDrag): void {
  dataTransfer.setData(TERMINAL_REF_MIME, JSON.stringify(payload));
}

export function parseTerminalRefDrag(dataTransfer: DataTransfer): TerminalRefDrag | null {
  const raw = dataTransfer.getData(TERMINAL_REF_MIME);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<TerminalRefDrag>;
    if (
      typeof parsed.id === 'string' &&
      parsed.id &&
      typeof parsed.name === 'string' &&
      parsed.name
    ) {
      return { id: parsed.id, name: parsed.name };
    }
  } catch {
    return null;
  }
  return null;
}
