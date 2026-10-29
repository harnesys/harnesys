export abstract class AttachmentStoragePort {
  abstract write(
    threadDir: string,
    id: string,
    fileName: string,
    bytes: Uint8Array,
  ): Promise<string>;
  abstract read(threadDir: string, relPath: string): Promise<Uint8Array | undefined>;
  abstract removeOne(threadDir: string, id: string): Promise<void>;
  abstract removeThread(threadDir: string): Promise<void>;
}
