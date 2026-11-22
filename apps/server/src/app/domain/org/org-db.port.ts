export abstract class OrgDbPort {
  abstract bootstrap(orgId: string, name: string): void;
  abstract rename(orgId: string, name: string): void;
  abstract snapshot(orgId: string, outPath: string): void;
}
