import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import { IssueAttachmentStoragePort } from '../../domain/issue/issue-attachment-storage.port.ts';

@Injectable()
export class IssueAttachmentStorageAdapter extends IssueAttachmentStoragePort {
  async write(issueDir: string, id: string, fileName: string, bytes: Uint8Array): Promise<string> {
    const relPath = `attachments/${id}/${fileName}`;
    const absPath = join(issueDir, relPath);
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, bytes);
    return relPath;
  }

  async read(issueDir: string, relPath: string): Promise<Uint8Array | undefined> {
    try {
      return new Uint8Array(await readFile(join(issueDir, relPath)));
    } catch {
      return undefined;
    }
  }

  async removeOne(issueDir: string, id: string): Promise<void> {
    await rm(join(issueDir, 'attachments', id), { recursive: true, force: true });
  }

  async removeAll(issueDir: string): Promise<void> {
    await rm(join(issueDir, 'attachments'), { recursive: true, force: true });
  }
}
