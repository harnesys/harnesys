import { Injectable } from '@harnesys/brix';
import { SupervisorHooks } from '../../supervisor/supervisor-deps.ts';
import type {
  ReasonsToLiveProvider,
  SupervisorHandlersValidator,
  SupervisorPermissionsProvider,
  SupervisorReplayHook,
  SupervisorRequestHandler,
} from '../../supervisor/supervisor-deps.ts';

export interface SupervisorHooksImpl {
  readonly requestHandler: SupervisorRequestHandler;
  readonly permissionsProvider: SupervisorPermissionsProvider;
  readonly handlersValidator: SupervisorHandlersValidator;
  readonly replayHook: SupervisorReplayHook;
  readonly reasonsToLive: ReasonsToLiveProvider;
}

/**
 * Construction-time aggregate handed to the supervisor. Implementations are
 * bound by the addons lifecycle service during `onModuleInit`, after the whole
 * container is constructed, so the supervisor has no constructor dependency on
 * call-path services (no DI cycle).
 */
@Injectable()
export class WiredSupervisorHooks extends SupervisorHooks {
  private impl: SupervisorHooksImpl | null = null;

  bind(impl: SupervisorHooksImpl): void {
    this.impl = impl;
  }

  override get requestHandler(): SupervisorRequestHandler {
    return this.requireImpl().requestHandler;
  }

  override get permissionsProvider(): SupervisorPermissionsProvider {
    return this.requireImpl().permissionsProvider;
  }

  override get handlersValidator(): SupervisorHandlersValidator {
    return this.requireImpl().handlersValidator;
  }

  override get replayHook(): SupervisorReplayHook {
    return this.requireImpl().replayHook;
  }

  override get reasonsToLive(): ReasonsToLiveProvider {
    return this.requireImpl().reasonsToLive;
  }

  private requireImpl(): SupervisorHooksImpl {
    if (!this.impl) {
      throw new Error('SupervisorHooks are not bound yet; addons lifecycle must run first');
    }
    return this.impl;
  }
}
