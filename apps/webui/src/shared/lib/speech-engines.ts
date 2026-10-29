import type { OrgModelRef } from '@/shared/api/model-execution';
import { synthesizeSpeech } from '@/shared/api/model-execution';
import { browserTtsSupported } from './browser-speech';
import type { SpeechEngine, SpeechHandle } from './speech-pipeline';

export interface SpeechEngineHooks {
  getRate?(): number;
  setRateApplier?(applier: ((rate: number) => void) | null): void;
}

export function browserSpeechEngine(hooks?: SpeechEngineHooks): SpeechEngine {
  return {
    prepare(text: string, signal: AbortSignal): SpeechHandle {
      if (!browserTtsSupported()) {
        return {
          done: Promise.reject(new Error('speech synthesis is not supported')),
          pause: () => undefined,
          resume: () => undefined,
        };
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = hooks?.getRate?.() ?? 1;
      let started = false;
      let pendingPause = false;
      let finish: (() => void) | undefined;
      let fail: ((message: string) => void) | undefined;
      const done = new Promise<void>((resolve, reject) => {
        finish = () => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        };
        fail = (message: string) => {
          signal.removeEventListener('abort', onAbort);
          reject(new Error(message));
        };
      });
      const onAbort = (): void => {
        window.speechSynthesis.cancel();
        fail?.('speech canceled');
      };
      utterance.onend = () => {
        finish?.();
      };
      utterance.onerror = (event) => {
        fail?.(`speech synthesis failed (${event.error})`);
      };
      utterance.onstart = () => {
        started = true;
        if (pendingPause) {
          window.speechSynthesis.pause();
        }
      };
      window.speechSynthesis.speak(utterance);
      signal.addEventListener('abort', onAbort, { once: true });
      return {
        done,
        pause(): void {
          if (started) {
            window.speechSynthesis.pause();
            return;
          }
          pendingPause = true;
        },
        resume(): void {
          pendingPause = false;
          if (started) {
            window.speechSynthesis.resume();
          }
        },
      };
    },
  };
}

export function modelSpeechEngine(
  source: OrgModelRef,
  voice?: string,
  hooks?: SpeechEngineHooks,
): SpeechEngine {
  return {
    prepare(text: string, signal: AbortSignal): SpeechHandle {
      let audio: HTMLAudioElement | undefined;
      let objectUrl: string | undefined;
      let settled = false;
      let pendingPause = false;
      let applierRegistered = false;
      const elements = new Set<HTMLAudioElement>();
      const applyRate = (rate: number): void => {
        for (const element of elements) {
          element.playbackRate = rate;
        }
      };
      let finish: (() => void) | undefined;
      let fail: ((message: string) => void) | undefined;
      const onAbort = (): void => {
        audio?.pause();
        if (objectUrl !== undefined) {
          URL.revokeObjectURL(objectUrl);
        }
        fail?.('speech canceled');
      };
      const done = new Promise<void>((resolve, reject) => {
        finish = () => {
          if (settled) {
            return;
          }
          settled = true;
          signal.removeEventListener('abort', onAbort);
          resolve();
        };
        fail = (message: string) => {
          if (settled) {
            return;
          }
          settled = true;
          signal.removeEventListener('abort', onAbort);
          reject(new Error(message));
        };
      });
      signal.addEventListener('abort', onAbort, { once: true });
      synthesizeSpeech({ ref: source, text, ...(voice === undefined ? {} : { voice }) })
        .then((blob) => {
          if (signal.aborted) {
            fail?.('speech canceled');
            return;
          }
          objectUrl = URL.createObjectURL(blob);
          const element = new Audio(objectUrl);
          audio = element;
          element.playbackRate = hooks?.getRate?.() ?? 1;
          elements.add(element);
          if (!applierRegistered) {
            applierRegistered = true;
            hooks?.setRateApplier?.(applyRate);
          }
          element.onended = () => {
            elements.delete(element);
            finish?.();
          };
          element.onerror = () => {
            elements.delete(element);
            fail?.('audio playback failed');
          };
          if (!pendingPause) {
            void element.play().catch(() => {
              if (!element.paused) {
                fail?.('audio playback failed');
              }
            });
          }
        })
        .catch((error: unknown) => {
          fail?.(
            error instanceof Error && error.message !== ''
              ? error.message
              : 'speech synthesis failed',
          );
        });
      return {
        done,
        pause(): void {
          pendingPause = true;
          audio?.pause();
        },
        resume(): void {
          pendingPause = false;
          if (settled) {
            return;
          }
          void audio?.play().catch(() => undefined);
        },
      };
    },
  };
}
