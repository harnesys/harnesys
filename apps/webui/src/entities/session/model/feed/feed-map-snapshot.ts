import type { MapDraft, MapFold } from './feed-maps';
import type { MapInfo, MapItemInfo } from './feed-types';

export function mapSnapshot(fold: MapFold): MapInfo[] {
  let changed = fold.drafts.length !== fold.published.length;
  const out: MapInfo[] = [];
  for (const draft of fold.drafts) {
    const itemsDirty = draft.info.items.some((item) => {
      const itemDraft = draft.itemsByWorker.get(item.workerId);
      return itemDraft ? itemDraft.dirty : false;
    });
    if (!draft.dirty && !itemsDirty && draft.published) {
      out.push(draft.published);
      continue;
    }
    const items = draft.info.items.map((item) => draftItemSnapshot(item, draft));
    const { items: _draftItems, ...rest } = draft.info;
    const snapshot: MapInfo = { ...rest, items };
    draft.published = snapshot;
    draft.dirty = false;
    out.push(snapshot);
    changed = true;
  }
  if (changed) {
    fold.published = out;
    return out;
  }
  return fold.published;
}

function draftItemSnapshot(item: MapItemInfo, draft: MapDraft): MapItemInfo {
  const itemDraft = draft.itemsByWorker.get(item.workerId);
  if (!itemDraft) {
    return item;
  }
  if (!itemDraft.dirty && itemDraft.published) {
    return itemDraft.published;
  }
  const snapshot: MapItemInfo = { ...itemDraft.info };
  itemDraft.published = snapshot;
  itemDraft.dirty = false;
  return snapshot;
}

export function mapForToolCall(maps: MapInfo[], toolCallId: string): MapInfo | undefined {
  return maps.find((map) => map.toolCallId === toolCallId);
}

export function mapLineHint(map: MapInfo): string {
  const done = map.items.filter((item) => item.status !== 'running').length;
  const mode = map.concurrency === 'sequential' ? 'sequential' : 'parallel';
  return `${mode} · ${done}/${map.count || map.items.length}`;
}
