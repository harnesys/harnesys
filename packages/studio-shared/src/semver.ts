/** Numeric semver helpers shared by the release-check cron and the webui. */

/** Parse "v1.2.3" / "1.2.3" into a numeric triple; null when it does not parse. */
export function parseVersion(tag: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** True when `latest` is a strictly newer semver than `current`; unparsable input is never newer. */
export function isNewerVersion(current: string, latest: string): boolean {
  const currentParts = parseVersion(current);
  const latestParts = parseVersion(latest);
  if (!currentParts || !latestParts) {
    return false;
  }
  return (
    latestParts[0] > currentParts[0] ||
    (latestParts[0] === currentParts[0] && latestParts[1] > currentParts[1]) ||
    (latestParts[0] === currentParts[0] &&
      latestParts[1] === currentParts[1] &&
      latestParts[2] > currentParts[2])
  );
}
