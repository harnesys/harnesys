import type { ChunkLimits } from './speech-text.ts';
import { splitByMax, splitChunks } from './speech-text.ts';

export type SpeechStatus = 'idle' | 'active' | 'paused';

export interface SpeechHandle {
  done: Promise<void>;
  pause(): void;
  resume(): void;
}

export interface SpeechEngine {
  prepare(text: string, signal: AbortSignal): SpeechHandle;
}

export interface SpeechPipeline {
  enqueue(text: string): void;
  flush(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  status(): SpeechStatus;
  isActive(): boolean;
  subscribe(listener: () => void): () => void;
  onStateChange(cb: (active: boolean) => void): () => void;
  onError(cb: (error: unknown) => void): () => void;
}

interface PipelineSession {
  controller: AbortController;
}

const DEFAULT_MIN = 120;
const DEFAULT_MAX = 280;
const PREFETCH_DEPTH = 2;

export function createSpeechPipeline(engine: SpeechEngine, limits?: ChunkLimits): SpeechPipeline {
  const minLimit = limits?.min ?? DEFAULT_MIN;
  const maxLimit = limits?.max ?? DEFAULT_MAX;
  let session: PipelineSession | null = null;
  let buffer = '';
  const queue: string[] = [];
  const prepared: SpeechHandle[] = [];
  let playing: SpeechHandle | undefined;
  let running = false;
  let state: SpeechStatus = 'idle';
  let gate = Promise.resolve();
  let gateRelease: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const errorListeners = new Set<(error: unknown) => void>();

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function notifyError(error: unknown): void {
    for (const listener of errorListeners) {
      listener(error);
    }
  }

  function setStatus(next: SpeechStatus): void {
    if (state === next) {
      return;
    }
    state = next;
    notify();
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function onStateChange(cb: (active: boolean) => void): () => void {
    return subscribe(() => {
      cb(state !== 'idle');
    });
  }

  function onError(cb: (error: unknown) => void): () => void {
    errorListeners.add(cb);
    return () => {
      errorListeners.delete(cb);
    };
  }

  function holdGate(): void {
    gate = new Promise<void>((resolve) => {
      gateRelease = resolve;
    });
  }

  function releaseGate(): void {
    const release = gateRelease;
    gateRelease = undefined;
    release?.();
  }

  function closeSession(): void {
    const currentSession = session;
    if (!currentSession) {
      return;
    }
    session = null;
    currentSession.controller.abort();
    for (const item of prepared) {
      item.done.catch(() => undefined);
    }
    queue.length = 0;
    prepared.length = 0;
    buffer = '';
  }

  function ensurePrepared(): void {
    const currentSession = session;
    if (!currentSession) {
      return;
    }
    while (prepared.length < queue.length && prepared.length < PREFETCH_DEPTH) {
      const text = queue[prepared.length];
      if (text === undefined) {
        break;
      }
      const handle = engine.prepare(text, currentSession.controller.signal);
      handle.pause();
      prepared.push(handle);
    }
  }

  function kick(): void {
    if (running || !session || queue.length === 0) {
      return;
    }
    const currentSession = session;
    running = true;
    void runWorker(currentSession);
  }

  async function playNext(currentSession: PipelineSession): Promise<boolean> {
    await (state === 'paused' ? gate : Promise.resolve());
    if (session !== currentSession) {
      return false;
    }
    ensurePrepared();
    const handle = prepared[0];
    if (!handle) {
      return false;
    }
    playing = handle;
    handle.resume();
    if (state === 'paused') {
      handle.pause();
    }
    await handle.done;
    if (session !== currentSession) {
      return false;
    }
    playing = undefined;
    queue.shift();
    prepared.shift();
    return true;
  }

  async function runWorker(currentSession: PipelineSession): Promise<void> {
    try {
      while (queue.length > 0 && session === currentSession) {
        const played = await playNext(currentSession);
        if (!played) {
          return;
        }
      }
    } catch (error) {
      if (session !== currentSession) {
        return;
      }
      closeSession();
      playing = undefined;
      running = false;
      setStatus('idle');
      notifyError(error);
    } finally {
      if (session === currentSession) {
        running = false;
        if (queue.length > 0) {
          kick();
        } else {
          setStatus('idle');
        }
      }
    }
  }

  function enqueue(text: string): void {
    if (text.trim() === '') {
      return;
    }
    if (!session) {
      session = { controller: new AbortController() };
    }
    buffer += text;
    const { complete, tail } = splitChunks(buffer, minLimit);
    if (complete.length > 0) {
      for (const chunk of complete) {
        queue.push(...splitByMax(chunk, maxLimit));
      }
      buffer = tail;
    }
    if (state === 'idle' && queue.length > 0) {
      setStatus('active');
    }
    ensurePrepared();
    kick();
  }

  function flush(): void {
    const tail = buffer.trim();
    if (tail === '') {
      return;
    }
    if (!session) {
      session = { controller: new AbortController() };
    }
    queue.push(...splitByMax(tail, maxLimit));
    buffer = '';
    if (state === 'idle' && queue.length > 0) {
      setStatus('active');
    }
    ensurePrepared();
    kick();
  }

  function pause(): void {
    if (state !== 'active') {
      return;
    }
    holdGate();
    setStatus('paused');
    playing?.pause();
  }

  function resume(): void {
    if (state !== 'paused') {
      return;
    }
    setStatus('active');
    releaseGate();
    playing?.resume();
  }

  function stop(): void {
    closeSession();
    playing = undefined;
    running = false;
    releaseGate();
    setStatus('idle');
  }

  return {
    enqueue,
    flush,
    pause,
    resume,
    stop,
    status: () => state,
    isActive: () => state !== 'idle',
    subscribe,
    onStateChange,
    onError,
  };
}
