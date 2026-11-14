import { Inject, Injectable, Logger } from '@harnesys/brix';
import type { AddonRescanResult } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { AddonPackageCatalogPort } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { AddonAuditPort } from '../../../domain/addons/ports/audit.port.ts';

const HOST_AUDIT_ORG = 'host';

export interface RescanRequest {
  actor: { kind: 'user' | 'system' | 'host'; id: string };
}

@Injectable()
export class RescanPackagesUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly catalog: AddonPackageCatalogPort,
    private readonly audit: AddonAuditPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addons-rescan');
  }

  execute(request: RescanRequest): AddonRescanResult {
    const result = this.catalog.rescanHomeDir();
    this.audit.append(HOST_AUDIT_ORG, {
      at: new Date().toISOString(),
      actor: request.actor,
      action: 'addon.package.rescan',
      target: 'host',
      outcome: 'ok',
      details: { added: result.added.length },
    });
    this.logger.info({ added: result.added.length }, 'host add-ons directory rescanned');
    return result;
  }
}
