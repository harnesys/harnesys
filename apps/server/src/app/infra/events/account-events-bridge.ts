import { Injectable, type ModuleDestroyHook, type ModuleInitHook } from '@harnesys/brix';
import { AccountEventPort } from '../../domain/apps/ports/account-event.port.ts';
import { EventBusPort } from '../../domain/events/event-bus.port.ts';

@Injectable()
export class AccountEventsBridge implements ModuleInitHook, ModuleDestroyHook {
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly accountEvents: AccountEventPort,
    private readonly bus: EventBusPort,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.accountEvents.subscribeAll((event) => {
      this.bus.publish(event.orgId, event.type, event);
    });
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
