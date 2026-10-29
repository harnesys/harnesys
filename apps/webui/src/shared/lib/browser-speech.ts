interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const scope = window as Partial<
    Record<'SpeechRecognition' | 'webkitSpeechRecognition', SpeechRecognitionCtor>
  >;
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function browserTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function browserSttSupported(): boolean {
  return recognitionCtor() !== null;
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (!browserTtsSupported()) {
    return [];
  }
  return window.speechSynthesis.getVoices();
}

export function onVoicesChanged(callback: () => void): () => void {
  if (!browserTtsSupported()) {
    return () => undefined;
  }
  window.speechSynthesis.addEventListener('voiceschanged', callback);
  return () => {
    window.speechSynthesis.removeEventListener('voiceschanged', callback);
  };
}

export interface SpeakOptions {
  voiceUri?: string | null;
  rate?: number;
}

export interface SpeakHandlers {
  onEnd(): void;
  onError(): void;
}

let speakToken = 0;

export function speak(text: string, options: SpeakOptions, handlers: SpeakHandlers): void {
  cancelSpeak();
  if (!browserTtsSupported()) {
    handlers.onError();
    return;
  }
  const token = speakToken;
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = options.voiceUri
    ? window.speechSynthesis.getVoices().find((entry) => entry.voiceURI === options.voiceUri)
    : undefined;
  if (voice) {
    utterance.voice = voice;
  }
  utterance.rate = options.rate === undefined ? 1 : Math.min(2, Math.max(0.5, options.rate));
  utterance.onend = () => {
    if (token === speakToken) {
      handlers.onEnd();
    }
  };
  utterance.onerror = () => {
    if (token === speakToken) {
      handlers.onError();
    }
  };
  window.speechSynthesis.speak(utterance);
}

export function cancelSpeak(): void {
  speakToken += 1;
  if (browserTtsSupported()) {
    window.speechSynthesis.cancel();
  }
}

export interface DictationHandlers {
  onInterim(text: string): void;
  onFinal(text: string): void;
  onError(message: string): void;
  onEnd(): void;
}

export interface DictationSession {
  stop(): void;
}

export function startDictation(
  lang: string | null,
  handlers: DictationHandlers,
): DictationSession | null {
  const ctor = recognitionCtor();
  if (!ctor) {
    return null;
  }
  const recognition = new ctor();
  recognition.lang = lang ?? navigator.language ?? 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;
  let stopped = false;
  recognition.onresult = (event) => {
    let interim = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const text = result[0]?.transcript ?? '';
      if (result.isFinal) {
        const trimmed = text.trim();
        if (trimmed) {
          handlers.onFinal(trimmed);
        }
      } else {
        interim += text;
      }
    }
    if (interim) {
      handlers.onInterim(interim);
    }
  };
  recognition.onerror = (event) => {
    if (stopped) {
      return;
    }
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      handlers.onError('Microphone access denied');
    }
  };
  recognition.onend = () => {
    handlers.onEnd();
  };
  recognition.start();
  return {
    stop(): void {
      stopped = true;
      recognition.stop();
    },
  };
}
