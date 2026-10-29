export type PermissionGate = 'allow' | 'ask' | 'deny';
export type PermissionMap = Record<string, PermissionGate>;
export { DEFAULT_PERMISSIONS } from '../constants.ts';
