export abstract class OrgDbPort {
  abstract bootstrap(orgId: string, name: string): void;
  abstract rename(orgId: string, name: string): void;
}
