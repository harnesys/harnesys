import type {
  DiscoveredModelView,
  IncompleteField,
  ProviderModelPublic,
} from '@harnesys/studio-shared';
import type { ModelFieldsDraft } from '@/features/manage-model';
export interface ModelRow {
  name: string;
  saved: boolean;
  stored?: ProviderModelPublic;
  found?: DiscoveredModelView;
}
const INCOMPLETE_FIELD_LABELS: Record<IncompleteField, string> = {
  context_length: 'Context',
  pricing: 'Input / output cost',
};
const EMBED_INCOMPLETE_FIELD_LABELS: Record<IncompleteField, string> = {
  context_length: 'Max input tokens',
  pricing: 'Price / token',
};
export function incompleteFieldLabel(field: IncompleteField, kind?: string): string {
  if (kind === 'embed') {
    return EMBED_INCOMPLETE_FIELD_LABELS[field];
  }
  return INCOMPLETE_FIELD_LABELS[field];
}
export function getMissingFields(row: ModelRow): IncompleteField[] {
  const meta = row.stored?.metadata as ModelFieldsDraft | undefined;
  const kind = row.stored?.kind ?? row.found?.kind;
  const chatLike = !kind || kind === 'chat';
  const missing: IncompleteField[] = [];
  const hasWindow =
    Boolean(meta?.context_length) ||
    Boolean(meta?.top_provider?.context_length) ||
    (typeof row.stored?.contextWindow === 'number' && row.stored.contextWindow > 0);
  if (chatLike && !hasWindow) {
    missing.push('context_length');
  }
  if (!meta?.pricing && row.found?.missing?.includes('pricing')) {
    missing.push('pricing');
  }
  return missing;
}
export function modelRows(
  stored: ProviderModelPublic[],
  found: DiscoveredModelView[] | null,
): ModelRow[] {
  const storedByName = new Map(stored.map((item) => [item.name, item]));
  const rows: ModelRow[] = stored.map((item) => ({
    name: item.name,
    saved: true,
    stored: item,
    found: found?.find((entry) => entry.name === item.name),
  }));
  if (!found) {
    return rows;
  }
  for (const item of found) {
    if (!storedByName.has(item.name)) {
      rows.push({ name: item.name, saved: false, found: item });
    }
  }
  return rows;
}
