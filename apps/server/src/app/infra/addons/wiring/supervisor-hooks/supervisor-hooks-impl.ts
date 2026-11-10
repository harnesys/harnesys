import { Injectable } from '@harnesys/brix';
import type { ContributionHandlersValidator } from './contribution-handlers-validator.ts';
import type { DispatcherRequestHandler } from './dispatcher-request-handler.ts';
import type { InstanceReplayHook } from './instance-replay-hook.ts';
import type { ManifestPermissionProvider } from './manifest-permission-provider.ts';
import type { AddonReasonsToLive } from './reasons-to-live.ts';
import { SupervisorHooks } from '../../supervisor/supervisor-deps.ts';

export interface SupervisorHooksImpl {
  readonly requestHandler: SupervisorHooks['requestHandler'];
  readonly permissionsProvider: SupervisorHooks['permissionsProvider'];
  readonly handlersValidator: SupervisorHooks['handlersValidator'];
  readonly replayHook: SupervisorHooks['replayHook'];
  readonly reasonsToLive: SupervisorHooks['reasonsToLive'];
}
