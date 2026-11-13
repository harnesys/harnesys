import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { InstallPlan } from '@harnesys/contracts';
import { AddonException } from '../../../domain/addons/errors.ts';
import { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import { PlanInstallUseCase } from './plan-install.use-case.ts';

export const MAX_UPLOAD_ARCHIVE_BYTES = 32 * 1024 * 1024;

const UPLOAD_TMP_DIR = '.tmp';

export interface UploadInstallArchiveRequest {
  name: string;
  bytes: Uint8Array;
  actor: { kind: 'user' | 'system' | 'host'; id: string };
}

/**
 * Multipart install path: persists the uploaded zip as a temp file under the
 * host home, plans it through the archive source, and removes the temp file
 * whatever the plan outcome is (the payload lives in staging after that).
 */
@Injectable()
export class UploadInstallArchiveUseCase {
  constructor(
    private readonly planInstall: PlanInstallUseCase,
    private readonly layout: HostFsLayoutPort,
  ) {}

  async execute(request: UploadInstallArchiveRequest): Promise<InstallPlan> {
    if (!request.name.toLowerCase().endsWith('.zip')) {
      throw new AddonException(
        'invalid_params',
        400,
        `Only .zip archives are accepted: ${request.name}`,
      );
    }
    if (request.bytes.byteLength > MAX_UPLOAD_ARCHIVE_BYTES) {
      throw new AddonException(
        'invalid_params',
        400,
        `Archive exceeds ${MAX_UPLOAD_ARCHIVE_BYTES} bytes: ${request.bytes.byteLength}`,
      );
    }
    const uploadPath = join(this.layout.home(), UPLOAD_TMP_DIR, `${randomUUID()}.zip`);
    mkdirSync(dirname(uploadPath), { recursive: true });
    writeFileSync(uploadPath, request.bytes);
    try {
      return await this.planInstall.execute({ source: uploadPath, actor: request.actor });
    } finally {
      rmSync(uploadPath, { force: true });
    }
  }
}
