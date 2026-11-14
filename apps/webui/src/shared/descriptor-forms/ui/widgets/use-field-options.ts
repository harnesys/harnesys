import type { FieldOption, FieldSpec, FieldValue } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { fetchAddonRoute } from '@/shared/api/addons';
import {
  type AddonRouteOptions,
  optionsFromAgents,
  optionsFromConnections,
  optionsFromRouteBody,
  routeOptionsParams,
} from '../../model/field-options';
import type { AddonFormContext } from '../widget-registry';

export interface ResolvedFieldOptions {
  options: FieldOption[];
  loading: boolean;
  failed: boolean;
  /** `dependsOn` values are not filled yet: the source cannot be queried. */
  blocked: boolean;
}

/**
 * Resolves `FieldSpec.optionsFrom` for a widget: static `options` stay the
 * fallback. One-off fetch per dependency change, no polling.
 */
export function useFieldOptions(
  field: FieldSpec,
  values: Record<string, FieldValue>,
  addon: AddonFormContext | undefined,
): ResolvedFieldOptions {
  const source = field.optionsFrom;
  const route = source?.kind === 'addonRoute' ? source : undefined;
  const params = route ? routeOptionsParams(route, values) : null;
  const ready = Boolean(route && addon && params);
  const optionsQuery = useQuery({
    queryKey: [
      'addon-route-options',
      addon?.orgId ?? '',
      addon?.addonId ?? '',
      route?.route ?? '',
      params ?? {},
    ],
    queryFn: async (): Promise<unknown> => {
      if (!route || !addon || !params) {
        return undefined;
      }
      return await fetchAddonRoute(addon.orgId, addon.addonId, route.route, params);
    },
    enabled: ready,
    staleTime: 60_000,
    retry: false,
  });

  if (!source) {
    return { options: field.options ?? [], loading: false, failed: false, blocked: false };
  }
  if (source.kind === 'connections') {
    return {
      options: addon ? optionsFromConnections(addon.connections) : [],
      loading: false,
      failed: !addon,
      blocked: false,
    };
  }
  if (source.kind === 'agents') {
    return {
      options: optionsFromAgents(addon?.agents),
      loading: false,
      failed: !addon || addon.agents === undefined,
      blocked: false,
    };
  }
  if (!addon) {
    return { options: field.options ?? [], loading: false, failed: true, blocked: false };
  }
  if (!params) {
    return { options: [], loading: false, failed: false, blocked: true };
  }
  if (optionsQuery.isError) {
    return { options: [], loading: false, failed: true, blocked: false };
  }
  return {
    options: optionsFromRouteBody(optionsQuery.data, route as AddonRouteOptions),
    loading: optionsQuery.isPending && optionsQuery.fetchStatus !== 'idle',
    failed: false,
    blocked: false,
  };
}
