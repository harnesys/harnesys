import { Injectable } from '@harnesys/brix';
import { releaseEngineSidecar, releaseSessionsForCredential } from 'harnesys';
import { BrowserSessionRegistryPort } from '../../domain/browser/browser-session-registry.port.ts';

@Injectable()
export class BrowserSessionRegistryAdapter extends BrowserSessionRegistryPort {
  async releaseForCredential(credentialId: string): Promise<string[]> {
    const keys = await releaseSessionsForCredential(credentialId);
    for (const key of keys) {
      await releaseEngineSidecar(key);
    }
    return keys;
  }
}
