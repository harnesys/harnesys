import type { SourceDistribution } from '@harnesys/contracts';
import { AddonException } from '../../../domain/addons/errors.ts';
import type { AddonCloudBackendRef } from '../../../domain/addons/ports/addon-cloud-backend.port.ts';
import type { BindingRepositoryPort } from '../../../domain/addons/ports/binding-repository.port.ts';
import type { CloudSyncSourceDistribution } from '../../../domain/source/cloud-sync-back.port.ts';

export function unusedAccessToken(): Promise<string> {
  return Promise.reject(
    new Error('add-on cloud sources resolve credentials inside the add-on process'),
  );
}

export function addonCloudBackendRefOf(
  distribution: SourceDistribution | CloudSyncSourceDistribution,
  orgId: string,
): AddonCloudBackendRef {
  if (distribution.kind !== 'addon-cloud') {
    throw new AddonException(
      'invalid_params',
      400,
      `source distribution kind '${distribution.kind}' is not served by an add-on`,
    );
  }
  return {
    orgId,
    addonId: distribution.addonId,
    sourceKindId: distribution.sourceKindId,
    accountId: distribution.accountId,
  };
}

export function resolveAddonAccount(input: {
  bindings: BindingRepositoryPort;
  orgId: string;
  addonId: string;
  connection?: string;
  accountId?: string;
}): string | undefined {
  if (input.connection === undefined) {
    if (input.accountId !== undefined) {
      throw new AddonException(
        'invalid_params',
        400,
        'this source kind needs no account; do not pass accountId',
      );
    }
    return undefined;
  }
  const bound = input.bindings.accountsFor(input.orgId, input.addonId, input.connection);
  if (bound.length === 0) {
    throw new AddonException(
      'conflict',
      409,
      `bind an account to connection '${input.connection}' before attaching a source`,
    );
  }
  if (input.accountId === undefined) {
    if (bound.length > 1) {
      throw new AddonException(
        'conflict',
        409,
        `connection '${input.connection}' has ${bound.length} accounts; pass accountId`,
      );
    }
    return bound[0]?.accountId;
  }
  const match = bound.find((row) => row.accountId === input.accountId);
  if (!match) {
    throw new AddonException(
      'not_found',
      404,
      `account ${input.accountId} is not bound to connection '${input.connection}'`,
    );
  }
  return match.accountId;
}
