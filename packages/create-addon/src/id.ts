export const ADDON_ID_PATTERN = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/;

export function isValidAddonId(id: string): boolean {
  return ADDON_ID_PATTERN.test(id);
}

export function nameFromId(id: string): string {
  const dot = id.lastIndexOf('.');
  return dot === -1 ? id : id.slice(dot + 1);
}

export function titleFromName(name: string): string {
  const words = name
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
  return words.length > 0 ? words.join(' ') : name;
}
