import type { z } from 'zod';

export type MethodDirection = 'host-to-addon' | 'addon-to-host' | 'notification';
export type NotificationSender = 'host' | 'addon' | 'both';

export interface MethodSpec<
  SParams extends z.ZodType,
  SResult extends z.ZodType | null,
  D extends MethodDirection = MethodDirection,
> {
  readonly direction: D;
  readonly params: SParams;
  readonly result: SResult;
  readonly permission: string | null;
  readonly sender?: NotificationSender;
}

export function hostMethod<SParams extends z.ZodType, SResult extends z.ZodType>(
  params: SParams,
  result: SResult,
  permission: string | null = null,
): MethodSpec<SParams, SResult, 'host-to-addon'> {
  return { direction: 'host-to-addon', params, result, permission };
}

export function addonMethod<SParams extends z.ZodType, SResult extends z.ZodType>(
  params: SParams,
  result: SResult,
  permission: string | null,
): MethodSpec<SParams, SResult, 'addon-to-host'> {
  return { direction: 'addon-to-host', params, result, permission };
}

export function notificationSpec<SParams extends z.ZodType>(
  params: SParams,
  sender: NotificationSender,
  permission: string | null = null,
): MethodSpec<SParams, null, 'notification'> {
  return { direction: 'notification', params, result: null, permission, sender };
}
