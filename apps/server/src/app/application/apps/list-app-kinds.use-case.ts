import { Injectable } from '@harnesys/brix';
import type { AppKindsResponse } from '@harnesys/contracts';
import { AppKindRegistryPort } from '../../domain/apps/app-kind.port.ts';
import { appKindView } from './app-view.ts';

@Injectable()
export class ListAppKindsUseCase {
  constructor(private readonly kinds: AppKindRegistryPort) {}

  execute(): AppKindsResponse {
    return { kinds: this.kinds.list().map(appKindView) };
  }
}
