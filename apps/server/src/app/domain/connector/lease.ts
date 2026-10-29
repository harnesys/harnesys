export function tryAcquireLease(input: {
  owner: string | null;
  until: string | null;
  me: string;
  now: number;
}): 'hold' | 'busy' {
  if (input.owner === null || input.owner === input.me) {
    return 'hold';
  }
  if (input.until === null || Date.parse(input.until) <= input.now) {
    return 'hold';
  }
  return 'busy';
}
