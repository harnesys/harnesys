import type {
  AddonConnectionView,
  FieldOption,
  FieldOptionsFrom,
  FieldValue,
} from '@harnesys/contracts';

export type AddonRouteOptions = Extract<FieldOptionsFrom, { kind: 'addonRoute' }>;

/**
 * Query params from `dependsOn` values. `null` while a dependency is empty:
 * the route must not be fetched with a missing key.
 */
export function routeOptionsParams(
  source: AddonRouteOptions,
  values: Record<string, FieldValue>,
): Record<string, string> | null {
  const params: Record<string, string> = {};
  for (const key of source.dependsOn ?? []) {
    const value = values[key];
    if (value === undefined || value === null || value === '') {
      return null;
    }
    params[key] = String(value);
  }
  return params;
}

/** Maps an add-on route response body to options; anything unexpected yields none. */
export function optionsFromRouteBody(body: unknown, source: AddonRouteOptions): FieldOption[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return [];
  }
  const rows = (body as Record<string, unknown>)[source.listKey ?? 'rows'];
  if (!Array.isArray(rows)) {
    return [];
  }
  const options: FieldOption[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      continue;
    }
    const record = row as Record<string, unknown>;
    const value = record[source.valueKey];
    if (typeof value !== 'string' && typeof value !== 'number') {
      continue;
    }
    const label = record[source.labelKey ?? source.valueKey];
    options.push({
      value: String(value),
      label: label === undefined || label === null ? String(value) : String(label),
    });
  }
  return options;
}

export function optionsFromConnections(connections: readonly AddonConnectionView[]): FieldOption[] {
  return connections.flatMap((connection) =>
    connection.accountIds.map((accountId) => ({
      value: accountId,
      label: `${connection.label} · ${accountId}`,
    })),
  );
}
