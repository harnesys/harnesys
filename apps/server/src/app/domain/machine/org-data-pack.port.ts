export abstract class OrgDataPackPort {
  abstract pack(orgId: string, outPath: string): Promise<boolean>;
  abstract unpack(orgId: string, archivePath: string): Promise<void>;
}
