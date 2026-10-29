import type { SecretStorePort } from '../../../../domain/secret/secret-store.port.ts';
import type { GoogleOAuthClientConfig } from '../../../integration/google/google-oauth-device.ts';
import {
  getValidGoogleAccessToken,
  loadGoogleOAuthClient,
} from '../../../integration/google/google-token-access.ts';
import type { CloudDriveSyncSource } from './cloud-sync-back.ts';

export interface CloudSyncCredentialLease {
  credential: string;
  release(): Promise<void>;
}

export interface LeasedTokenReaderInput {
  secrets: SecretStorePort;
  orgId: string;
  source: CloudDriveSyncSource;
  clientCache: { client?: GoogleOAuthClientConfig };
}

export function leasedTokenReader(input: LeasedTokenReaderInput): () => Promise<string> {
  return async () => {
    let client = input.clientCache.client;
    if (!client) {
      client = await loadGoogleOAuthClient(input.secrets, input.orgId);
      input.clientCache.client = client;
    }
    return getValidGoogleAccessToken(
      input.secrets,
      input.orgId,
      input.source.distribution.integrationId,
      client,
    );
  };
}
