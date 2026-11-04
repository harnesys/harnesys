export function shouldFallbackToEdit(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('TEXTDRAFT') || message.toLowerCase().includes('forum');
}

export function retryAfterMs(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'retryAfter' in error) {
    const value = (error as { retryAfter: unknown }).retryAfter;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value * 1000;
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes('429')) {
    return null;
  }
  const match = /retry_after["\s:=]+(\d+)/i.exec(message);
  return match ? Number(match[1]) * 1000 : 1000;
}
