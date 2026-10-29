import type { OrgNodeIdentity } from '@harnesys/contracts';

export abstract class NodeIdentityStore {
  abstract read(orgId: string): OrgNodeIdentity | null;
  abstract write(identity: OrgNodeIdentity): void;
  abstract remove(orgId: string): void;
  abstract list(): OrgNodeIdentity[];
}
