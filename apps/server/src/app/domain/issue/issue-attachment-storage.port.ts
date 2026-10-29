export abstract class IssueAttachmentStoragePort {
  abstract write(
    issueDir: string,
    id: string,
    fileName: string,
    bytes: Uint8Array,
  ): Promise<string>;
  abstract read(issueDir: string, relPath: string): Promise<Uint8Array | undefined>;
  abstract removeOne(issueDir: string, id: string): Promise<void>;
  abstract removeAll(issueDir: string): Promise<void>;
}
