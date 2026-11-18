export const GRID_STEP = 8;

export interface GridRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GridEntry {
  id: string;
  rect: GridRect;
  /** Minimum width in pixels during resize. */
  minW?: number;
  /** Minimum height in pixels during resize. */
  minH?: number;
}

export function snap(value: number): number {
  return Math.round(value / GRID_STEP) * GRID_STEP;
}

export function snapRect(rect: GridRect): GridRect {
  return { x: snap(rect.x), y: snap(rect.y), w: snap(rect.w), h: snap(rect.h) };
}

export function positiveRect(rect: GridRect): GridRect {
  return rect.x < 0 || rect.y < 0
    ? { ...rect, x: Math.max(rect.x, 0), y: Math.max(rect.y, 0) }
    : rect;
}

export function contentHeight(entries: readonly GridEntry[]): number {
  return entries.reduce((max, entry) => Math.max(max, entry.rect.y + entry.rect.h), 0);
}

export function sameRect(a: GridRect, b: GridRect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

export function sameEntries(a: readonly GridEntry[], b: readonly GridEntry[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const byId = new Map(b.map((entry) => [entry.id, entry]));
  return a.every((entry) => {
    const other = byId.get(entry.id);
    return other !== undefined && sameRect(entry.rect, other.rect);
  });
}

export function clampRect(rect: GridRect, minW: number, minH: number, maxWidth: number): GridRect {
  const w = Math.max(snap(rect.w), minW);
  const h = Math.max(snap(rect.h), minH);
  const x = Math.min(Math.max(snap(rect.x), 0), Math.max(maxWidth - w, 0));
  const y = Math.max(snap(rect.y), 0);
  return { x, y, w, h };
}

export function rectsOverlap(a: GridRect, b: GridRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function byRowThenCol(a: GridEntry, b: GridEntry): number {
  return a.rect.y - b.rect.y || a.rect.x - b.rect.x;
}

/**
 * Free placement without overlaps: the active entry takes its desired box,
 * every other entry keeps its position until it collides, then moves below the
 * blocker. Entries never compact upward, so empty space stays where the user
 * left it.
 */
export function resolveCollisions(
  entries: readonly GridEntry[],
  activeId: string,
  desired: GridRect,
  minH: number,
): GridEntry[] {
  const active = entries.find((entry) => entry.id === activeId);
  if (!active) {
    return [...entries];
  }
  const ordered = [
    { ...active, rect: { ...desired, h: Math.max(desired.h, minH) } },
    ...entries.filter((entry) => entry.id !== activeId).sort(byRowThenCol),
  ];
  const placed: GridEntry[] = [];
  for (const entry of ordered) {
    let rect = { ...entry.rect };
    let collided = true;
    let guard = 0;
    while (collided && guard < 400) {
      collided = false;
      for (const other of placed) {
        if (rectsOverlap(rect, other.rect)) {
          rect = { ...rect, y: other.rect.y + other.rect.h };
          collided = true;
          guard += 1;
        }
      }
    }
    placed.push({ ...entry, rect });
  }
  const byId = new Map(placed.map((entry) => [entry.id, entry]));
  return entries.map((entry) => byId.get(entry.id) ?? entry);
}
