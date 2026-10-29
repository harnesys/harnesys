import { alert } from '@/shared/services/overlay';

export function confirmDisconnectHost(nodeName: string) {
  return alert.confirm({
    title: `Disconnect ${nodeName}?`,
    description:
      'The worker stays in the fleet but stops accepting new work. Active runs may finish; reconnect restores capacity.',
    confirmText: 'Disconnect',
    variant: 'destructive',
    testId: 'fleet-disconnect-dialog',
  });
}

export function confirmRemoveHost(nodeName: string) {
  return alert.confirm({
    title: `Remove ${nodeName}?`,
    description:
      'Removes this worker from the organization, drops it from execution profiles, and fails pending placements. The machine leaves the org if it is online.',
    confirmText: 'Remove host',
    variant: 'destructive',
    testId: 'fleet-remove-dialog',
  });
}

export function confirmRotateHostToken(nodeName: string) {
  return alert.confirm({
    title: `Rotate token for ${nodeName}?`,
    description:
      'The current token stops working immediately and the organization ticket key is rotated with it. The new token is shown once — the worker cannot reconnect until you put it on that machine.',
    confirmText: 'Rotate token',
    variant: 'destructive',
    testId: 'fleet-rotate-dialog',
  });
}

export function confirmLeaveOrganization(orgName: string) {
  return alert.confirm({
    title: `Leave ${orgName}?`,
    description:
      'This machine leaves the organization. Local desk access for this org ends. You can join again with a new invite.',
    confirmText: 'Leave organization',
    variant: 'destructive',
    testId: 'fleet-leave-dialog',
  });
}
