import { Injectable } from '@harnesys/brix';
import type { AppKindDescriptor } from '../../domain/apps/app-kind.port.ts';
import { AppKindRegistryPort } from '../../domain/apps/app-kind.port.ts';
import { AppKindUnknownException } from '../../domain/apps/apps.error.ts';
import { BUILTIN_APP_KINDS } from './app-kind.catalog.ts';

@Injectable()
export class AppKindRegistryAdapter extends AppKindRegistryPort {
  list(): AppKindDescriptor[] {
    return BUILTIN_APP_KINDS;
  }

  find(kind: string): AppKindDescriptor | null {
    return BUILTIN_APP_KINDS.find((descriptor) => descriptor.kind === kind) ?? null;
  }

  require(kind: string): AppKindDescriptor {
    const found = this.find(kind);
    if (!found) {
      throw new AppKindUnknownException(kind);
    }
    return found;
  }
}
