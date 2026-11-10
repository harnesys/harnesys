import { Injectable } from '@harnesys/brix';
import { GoogleCredKeyPort } from '../../application/fleet/google-cred-key.port.ts';
import { googleCredKey } from '../integration/google/google-token-access.ts';

@Injectable()
export class GoogleCredKeyAdapter extends GoogleCredKeyPort {
  override credKey(credRef: string): string {
    return googleCredKey(credRef);
  }
}
