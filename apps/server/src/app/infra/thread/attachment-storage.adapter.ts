import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import { AttachmentStoragePort } from '../../domain/thread/attachment-storage.port.ts';

@Injectable()
export class AttachmentStorageAdapter extends AttachmentStoragePort {
  async write(threadDir: string, id: string, fileName: string, bytes: Uint8Array): Promise<string> {
    const relPath = `attachments/${id}/${fileName}`;
    const absPath = join(threadDir, relPath);
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, bytes);
    return relPath;
  }

  async read(threadDir: string, relPath: string): Promise<Uint8Array | undefined> {
    try {
      return new Uint8Array(await readFile(join(threadDir, relPath)));
    } catch {
      return undefined;
    }
  }

  async removeOne(threadDir: string, id: string): Promise<void> {
    await rm(join(threadDir, 'attachments', id), { recursive: true, force: true });
  }

  async removeThread(threadDir: string): Promise<void> {
    await rm(threadDir, { recursive: true, force: true });
  }
}
