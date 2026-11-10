export type AddonRouteRole = 'member' | 'admin';
export type AddonRouteExposure = 'org' | 'public';

export interface AddonRouteMatch {
  routeId: string;
  params: Record<string, string>;
  role: AddonRouteRole;
  exposure: AddonRouteExposure;
  bodyLimitKb: number;
  requestSchema: Record<string, unknown> | undefined;
}

export interface AddonRouteEntryView {
  routeId: string;
  method: string;
  path: string;
  role: AddonRouteRole;
  exposure: AddonRouteExposure;
  bodyLimitKb: number;
}

export abstract class AddonRouteTablePort {
  abstract resolve(
    orgId: string,
    addonId: string,
    method: string,
    path: string,
  ): AddonRouteMatch | null;

  abstract list(orgId: string, addonId: string): AddonRouteEntryView[];
}
