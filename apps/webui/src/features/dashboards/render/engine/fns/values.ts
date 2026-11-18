export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isTruthy(value: unknown): boolean {
  return Boolean(value);
}

export function asList(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function numbersOf(list: readonly unknown[]): number[] {
  const numbers: number[] = [];
  for (const entry of list) {
    const number = toNumber(entry);
    if (number !== null) {
      numbers.push(number);
    }
  }
  return numbers;
}

export function stringOf(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function compareValues(a: unknown, b: unknown): number {
  const left = toNumber(a);
  const right = toNumber(b);
  if (left !== null && right !== null) {
    return left - right;
  }
  if (a === null || a === undefined) {
    return b === null || b === undefined ? 0 : 1;
  }
  if (b === null || b === undefined) {
    return -1;
  }
  return stringOf(a).localeCompare(stringOf(b));
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((entry, index) => deepEqual(entry, b[index]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const left = Object.keys(a);
    const right = Object.keys(b);
    if (left.length !== right.length) {
      return false;
    }
    return left.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]));
  }
  return false;
}
