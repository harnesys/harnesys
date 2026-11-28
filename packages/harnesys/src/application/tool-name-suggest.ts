const SUGGEST_LIMIT = 3;

function boundedDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) {
    return max + 1;
  }
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      const value = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      row.push(value);
      if (value < rowMin) {
        rowMin = value;
      }
    }
    if (rowMin > max) {
      return max + 1;
    }
    prev = row;
  }
  return prev[b.length] ?? max + 1;
}

export function nearestToolNames(requested: string, candidates: Iterable<string>): string[] {
  const max = Math.max(2, Math.floor(requested.length / 4));
  const scored: Array<{ name: string; distance: number }> = [];
  for (const name of candidates) {
    if (name === requested) {
      continue;
    }
    const distance = boundedDistance(requested, name, max);
    if (distance <= max) {
      scored.push({ name, distance });
    }
  }
  scored.sort((x, y) => x.distance - y.distance || x.name.localeCompare(y.name));
  return scored.slice(0, SUGGEST_LIMIT).map((entry) => entry.name);
}
