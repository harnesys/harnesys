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

export function playInboxSound(): void {
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
