import type { OrgModelRef } from './model-execution';

export type VoiceModelKind = 'speech' | 'transcription';

export type VoiceSource =
  | { kind: 'browser' }
  | ({ kind: 'model' } & OrgModelRef & { voice?: string });

function sourceStorageKey(orgId: string, kind: VoiceModelKind): string {
  return `voice-source:${orgId}:${kind}`;
}

function legacyModelStorageKey(orgId: string, kind: VoiceModelKind): string {
  return `voice-model:${orgId}:${kind}`;
}

function parseModelSource(parsed: unknown): VoiceSource | null {
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.provider !== 'string' || typeof record.model !== 'string') {
    return null;
  }
  if (typeof record.voice === 'string' && record.voice !== '') {
    return { kind: 'model', provider: record.provider, model: record.model, voice: record.voice };
  }
  return { kind: 'model', provider: record.provider, model: record.model };
}

export function getVoiceSource(orgId: string, kind: VoiceModelKind): VoiceSource | null {
  try {
    const raw = localStorage.getItem(sourceStorageKey(orgId, kind));
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        const record = parsed as Record<string, unknown>;
        if (record.kind === 'browser') {
          return { kind: 'browser' };
        }
        const model = parseModelSource(parsed);
        if (model) {
          return model;
        }
      }
    }
    const legacyRaw = localStorage.getItem(legacyModelStorageKey(orgId, kind));
    if (!legacyRaw) {
      return null;
    }
    return parseModelSource(JSON.parse(legacyRaw));
  } catch {
    return null;
  }
}

export function setVoiceSource(orgId: string, kind: VoiceModelKind, source: VoiceSource): void {
  try {
    const value =
      source.kind === 'browser'
        ? { kind: 'browser' }
        : {
            kind: 'model',
            provider: source.provider,
            model: source.model,
            ...(source.voice === undefined ? {} : { voice: source.voice }),
          };
    localStorage.setItem(sourceStorageKey(orgId, kind), JSON.stringify(value));
  } catch {
    return;
  }
}

export function setVoiceSourceVoice(
  orgId: string,
  kind: VoiceModelKind,
  voice: string | null,
): void {
  const source = getVoiceSource(orgId, kind);
  if (source?.kind !== 'model') {
    return;
  }
  const next: VoiceSource = { kind: 'model', provider: source.provider, model: source.model };
  if (voice !== null && voice !== '') {
    next.voice = voice;
  }
  setVoiceSource(orgId, kind, next);
}

function readString(key: string): string | null {
  try {
    const raw = localStorage.getItem(key);
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

const BROWSER_VOICE_KEY = 'voice-browser-voice';

export function getBrowserVoiceUri(): string | null {
  return readString(BROWSER_VOICE_KEY);
}

export function setBrowserVoiceUri(uri: string): void {
  writeString(BROWSER_VOICE_KEY, uri);
}

const SPEECH_RATE_KEY = 'voice-rate';
const SPEECH_RATE_DEFAULT = 1;

export function getSpeechRate(): number {
  const raw = readString(SPEECH_RATE_KEY);
  if (!raw) {
    return SPEECH_RATE_DEFAULT;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return SPEECH_RATE_DEFAULT;
  }
  return Math.min(2, Math.max(0.5, parsed));
}

export function setSpeechRate(rate: number): void {
  writeString(SPEECH_RATE_KEY, String(Math.min(2, Math.max(0.5, rate))));
}

const DICTATION_LANG_KEY = 'voice-dictation-lang';

export function getDictationLang(): string | null {
  return readString(DICTATION_LANG_KEY);
}

export function setDictationLang(lang: string): void {
  writeString(DICTATION_LANG_KEY, lang);
}

function autoReadStorageKey(orgId: string): string {
  return `voice-auto-read:${orgId}`;
}

export function getAutoRead(orgId: string): boolean {
  return readString(autoReadStorageKey(orgId)) === '1';
}

const autoReadListeners = new Set<() => void>();

export function subscribeAutoRead(cb: () => void): () => void {
  autoReadListeners.add(cb);
  return () => {
    autoReadListeners.delete(cb);
  };
}

export function setAutoRead(orgId: string, on: boolean): void {
  writeString(autoReadStorageKey(orgId), on ? '1' : '0');
  for (const listener of autoReadListeners) {
    listener();
  }
}
