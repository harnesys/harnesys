import { Injectable, type ModuleInitHook } from '@harnesys/brix';
import { IntegrationEventsPort } from '../../domain/integration/integration-events.port.ts';
import { IntegrationRegistryPort } from '../../domain/integration/integration-registry.port.ts';
import { IntegrationTokenPort } from '../../domain/integration/integration-token.port.ts';
import { setGithubToolsDeps } from '../../infra/runtime/packs/github-tools.holder.ts';
import type { OrgGithubDeps } from '../../infra/runtime/packs/org-github.port.ts';

@Injectable()
export class GithubToolsProvider implements ModuleInitHook {
  constructor(
    private readonly registry: IntegrationRegistryPort,
    private readonly tokens: IntegrationTokenPort,
    private readonly events: IntegrationEventsPort,
  ) {}

  onModuleInit(): void {
    const deps: OrgGithubDeps = {
      registry: this.registry,
      tokens: this.tokens,
      events: this.events,
    };
    setGithubToolsDeps(deps);
  }
}
