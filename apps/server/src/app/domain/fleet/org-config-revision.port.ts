export abstract class OrgConfigRevisionPort {
  abstract get(orgId: string): { revision: number; contentHash: string };
  abstract sync(orgId: string, contentHash: string): { revision: number; bumped: boolean };
}
