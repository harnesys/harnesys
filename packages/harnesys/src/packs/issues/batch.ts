export interface BatchOutcome<TItem, TFailure> {
  done: number;
  items: TItem[];
  failed: TFailure[];
}

export async function runBatch<TEntry, TItem, TFailure>(
  entries: readonly TEntry[],
  emptyName: string,
  apply: (entry: TEntry) => Promise<TItem>,
  toFailure: (entry: TEntry, error: string) => TFailure,
): Promise<BatchOutcome<TItem, TFailure>> {
  if (entries.length === 0) {
    throw new Error(`${emptyName} is empty`);
  }
  const items: TItem[] = [];
  const failed: TFailure[] = [];
  for (const entry of entries) {
    try {
      items.push(await apply(entry));
    } catch (error) {
      failed.push(toFailure(entry, error instanceof Error ? error.message : String(error)));
    }
  }
  return { done: items.length, items, failed };
}
