import type { CapabilityScope } from '../../domain/pack.ts';
import type { GoogleWorkspacePort } from '../../ports/google-workspace.ts';

export interface GoogleToolsDeps {
  google: GoogleWorkspacePort;
  resolveScope: () => CapabilityScope;
  integrationId: string;
}
