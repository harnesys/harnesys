import { UsageBoard } from './usage-board';

export function UsagePane({ orgId }: { orgId: string }) {
  return <UsageBoard orgId={orgId} />;
}
