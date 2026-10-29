import { Injectable, type ModuleInitHook } from '@harnesys/brix';
import { IntegrationRegistryPort } from '../../domain/integration/integration-registry.port.ts';
import { IntegrationTokenPort } from '../../domain/integration/integration-token.port.ts';
import { setGoogleToolsDeps } from '../../infra/runtime/packs/google-tools.holder.ts';
import type { OrgGoogleDeps } from '../../infra/runtime/packs/org-google.port.ts';

@Injectable()
export class GoogleToolsProvider implements ModuleInitHook {
  constructor(
    private readonly registry: IntegrationRegistryPort,
    private readonly tokens: IntegrationTokenPort,
  ) {}

  onModuleInit(): void {
    const deps: OrgGoogleDeps = {
      registry: this.registry,
      tokens: this.tokens,
    };
    setGoogleToolsDeps(deps);
  }
}
