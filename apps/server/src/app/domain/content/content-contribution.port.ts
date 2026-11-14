import type { Disposable } from '../addons/owner.ts';

export interface ContentContributionRequest {
  skillId: string;
  title: string;
  sourcePath: string;
}

/**
 * Registers addon package content (skills) in the host content storage so
 * agents list them like org skills. Registration returns a Disposable that
 * removes the contribution when the addon deactivates.
 */
export abstract class ContentContributionPort {
  abstract register(
    orgId: string,
    addonId: string,
    request: ContentContributionRequest,
  ): Disposable;
}
