import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, renameSync } from 'node:fs';
import { promisify } from 'node:util';
import { Injectable } from '@harnesys/brix';
import { OrgBackupArchivePort } from '../../domain/machine/org-backup-archive.port.ts';

const execFileAsync = promisify(execFile);
const HASH_CHUNK_BYTES = 1024 * 1024;

@Injectable()
export class OrgBackupArchiveAdapter extends OrgBackupArchivePort {
  async create(files: string[], stagingDir: string, outPath: string): Promise<void> {
    await execFileAsync('tar', ['-czf', `${outPath}.tmp`, '-C', stagingDir, ...files]);
    renameSync(`${outPath}.tmp`, outPath);
  }

  async extract(archivePath: string, destDir: string): Promise<void> {
    await execFileAsync('tar', ['-xzf', archivePath, '-C', destDir]);
  }

  async hashFile(path: string): Promise<string> {
    const hash = createHash('sha256');
    const stream = createReadStream(path, { highWaterMark: HASH_CHUNK_BYTES });
    for await (const chunk of stream) {
      hash.update(chunk);
    }
    return hash.digest('hex');
  }
}
