export type ApprovalChimeScheme = 'chime' | 'ding' | 'alert' | 'ping';

interface ChimeTone {
  frequency: number;
  startDelay: number;
  duration: number;
}

const mutedStorageKey = 'harnesys.approval-chime-muted';
const schemeStorageKey = 'harnesys.approval-chime-scheme';
const defaultScheme: ApprovalChimeScheme = 'chime';

const chimeSchemes: Record<ApprovalChimeScheme, ChimeTone[]> = {
  chime: [
    { frequency: 880, startDelay: 0, duration: 0.16 },
    { frequency: 1174.66, startDelay: 0.14, duration: 0.26 },
  ],
  ding: [{ frequency: 1318.51, startDelay: 0, duration: 0.5 }],
  alert: [
    { frequency: 1046.5, startDelay: 0, duration: 0.1 },
    { frequency: 1046.5, startDelay: 0.16, duration: 0.1 },
  ],
  ping: [{ frequency: 1760, startDelay: 0, duration: 0.12 }],
};

let audioContext: AudioContext | null = null;
let unlocked = false;
const seenApprovalIds = new Set<string>();

export function ensureApprovalChimeUnlock(): void {
  if (unlocked || typeof document === 'undefined') {
    return;
  }
  const unlock = (): void => {
    unlocked = true;
    audioContext ??= createAudioContext();
    void audioContext?.resume().catch(() => undefined);
  };
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });
}

export function notifyApprovalRequested(approvalId: string): void {
  if (seenApprovalIds.has(approvalId)) {
    return;
  }
  seenApprovalIds.add(approvalId);
  if (!unlocked || !audioContext || isApprovalChimeMuted()) {
    return;
  }
  playScheme(audioContext, getApprovalChimeScheme());
}

export function previewApprovalChime(): void {
  if (typeof document === 'undefined') {
    return;
  }
  unlocked = true;
  audioContext ??= createAudioContext();
  if (!audioContext) {
    return;
  }
  void audioContext.resume().catch(() => undefined);
  playScheme(audioContext, getApprovalChimeScheme());
}

export function isApprovalChimeMuted(): boolean {
  try {
    return localStorage.getItem(mutedStorageKey) === '1';
  } catch {
    return false;
  }
}

export function setApprovalChimeMuted(muted: boolean): void {
  try {
    if (muted) {
      localStorage.setItem(mutedStorageKey, '1');
      return;
    }
    localStorage.removeItem(mutedStorageKey);
  } catch {
    return;
  }
}

export function getApprovalChimeScheme(): ApprovalChimeScheme {
  try {
    const raw = localStorage.getItem(schemeStorageKey);
    if (raw && raw in chimeSchemes) {
      return raw as ApprovalChimeScheme;
    }
  } catch {
    return defaultScheme;
  }
  return defaultScheme;
}

export function setApprovalChimeScheme(scheme: ApprovalChimeScheme): void {
  try {
    localStorage.setItem(schemeStorageKey, scheme);
  } catch {
    return;
  }
}

function createAudioContext(): AudioContext | null {
  try {
    return new AudioContext();
  } catch {
    return null;
  }
}

function playScheme(audio: AudioContext, scheme: ApprovalChimeScheme): void {
  const baseTime = audio.currentTime;
  for (const item of chimeSchemes[scheme]) {
    playTone(audio, item, baseTime);
  }
}

function playTone(audio: AudioContext, item: ChimeTone, baseTime: number): void {
  const start = baseTime + item.startDelay;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = item.frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + item.duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + item.duration + 0.02);
}
