let ctx: AudioContext | undefined;

function ensureContext(): AudioContext | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  if (!ctx) {
    const Ctor = window.AudioContext;
    if (!Ctor) {
      return undefined;
    }
    ctx = new Ctor();
  }
  return ctx;
}

function playChime(): void {
  const audio = ensureContext();
  if (!audio) {
    return;
  }
  if (audio.state === 'suspended') {
    void audio.resume().catch(() => {
      // autoplay policy: will unlock after first user gesture
    });
  }
  const now = audio.currentTime;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
  gain.connect(audio.destination);
  for (const [offset, freq] of [
    [0, 880],
    [0.15, 1175],
  ] as const) {
    const osc = audio.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(now + offset);
    osc.stop(now + offset + 0.25);
  }
}

export type NotifySoundEvent =
  | { kind: 'approval-requested'; approvalId: string }
  | { kind: 'board-rule-raised'; issueId: string; text: string }
  | { kind: 'thread-finished'; threadId: string; viewing: boolean };

const RING_DEDUPE_WINDOW_MS = 10_000;
const GLOBAL_RING_GAP_MS = 1_000;
const RING_KEYS_MAX = 200;

let lastGlobalRing = 0;
const lastRingByKey = new Map<string, number>();

export function playNotifySound(event: NotifySoundEvent): void {
  if (!shouldRing(event)) {
    return;
  }
  const now = Date.now();
  if (now - lastGlobalRing < GLOBAL_RING_GAP_MS) {
    return;
  }
  const key = dedupeKey(event);
  const last = lastRingByKey.get(key);
  if (last !== undefined && now - last < RING_DEDUPE_WINDOW_MS) {
    return;
  }
  lastRingByKey.set(key, now);
  lastGlobalRing = now;
  pruneRingKeys(now);
  playChime();
}

function shouldRing(event: NotifySoundEvent): boolean {
  switch (event.kind) {
    case 'approval-requested':
      return true;
    case 'board-rule-raised':
      return true;
    case 'thread-finished':
      return !event.viewing;
  }
}

function dedupeKey(event: NotifySoundEvent): string {
  switch (event.kind) {
    case 'approval-requested':
      return `approval:${event.approvalId}`;
    case 'board-rule-raised':
      return `rule:${event.issueId}:${event.text}`;
    case 'thread-finished':
      return `thread:${event.threadId}`;
  }
}

function pruneRingKeys(now: number): void {
  if (lastRingByKey.size <= RING_KEYS_MAX) {
    return;
  }
  for (const [key, at] of lastRingByKey) {
    if (now - at >= RING_DEDUPE_WINDOW_MS) {
      lastRingByKey.delete(key);
    }
  }
}
