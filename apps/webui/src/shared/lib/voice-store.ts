import { getSpeechRate, setSpeechRate, type VoiceSource } from '@/shared/api/voice-prefs';
import { browserSpeechEngine, modelSpeechEngine } from './speech-engines';
import {
  createSpeechPipeline,
  type SpeechEngine,
  type SpeechPipeline,
  type SpeechStatus,
} from './speech-pipeline';
import { cleanTextForSpeech } from './speech-text';

export interface VoicePlaybackState {
  status: SpeechStatus;
  owner: symbol | null;
}

const FENCE = /```/g;
const storeListeners = new Set<() => void>();
const errorListeners = new Set<(error: unknown) => void>();
let pipeline: SpeechPipeline | null = null;
let currentOwner: symbol | null = null;
let rawStreamBuffer = '';
let snapshot: VoicePlaybackState = { status: 'idle', owner: null };
let voiceRate = 1;
let rateApplier: ((rate: number) => void) | null = null;

function engineFor(source: VoiceSource): SpeechEngine {
  const hooks = {
    getRate: () => voiceRate,
    setRateApplier: (applier: ((rate: number) => void) | null) => {
      rateApplier = applier;
    },
  };
  if (source.kind === 'browser') {
    return browserSpeechEngine(hooks);
  }
  return modelSpeechEngine({ provider: source.provider, model: source.model }, source.voice, hooks);
}

function publish(): void {
  const next: VoicePlaybackState = {
    status: pipeline?.status() ?? 'idle',
    owner: currentOwner,
  };
  if (next.status === snapshot.status && next.owner === snapshot.owner) {
    return;
  }
  snapshot = next;
  for (const listener of storeListeners) {
    listener();
  }
}

function startPipeline(source: VoiceSource): SpeechPipeline {
  pipeline?.stop();
  voiceRate = getSpeechRate();
  pipeline = createSpeechPipeline(engineFor(source));
  pipeline.subscribe(publish);
  pipeline.onError((error) => {
    currentOwner = null;
    rawStreamBuffer = '';
    publish();
    for (const listener of errorListeners) {
      listener(error);
    }
  });
  return pipeline;
}

function streamSafePrefix(buffer: string): string {
  const cut = buffer.lastIndexOf('\n');
  if (cut < 0) {
    return '';
  }
  const head = buffer.slice(0, cut + 1);
  const fences = head.match(FENCE);
  return fences !== null && fences.length % 2 === 1 ? '' : head;
}

export function getVoiceSnapshot(): VoicePlaybackState {
  return snapshot;
}

export function subscribeVoice(cb: () => void): () => void {
  storeListeners.add(cb);
  return () => {
    storeListeners.delete(cb);
  };
}

export function speakText(owner: symbol, source: VoiceSource, text: string): void {
  const target = startPipeline(source);
  currentOwner = owner;
  rawStreamBuffer = '';
  target.enqueue(cleanTextForSpeech(text));
  target.flush();
  publish();
}

export function enqueueStreamText(owner: symbol, source: VoiceSource, delta: string): void {
  if (currentOwner !== null && currentOwner !== owner) {
    return;
  }
  if (currentOwner === null || (pipeline?.status() === 'idle' && rawStreamBuffer === '')) {
    pipeline = startPipeline(source);
  }
  currentOwner = owner;
  publish();
  rawStreamBuffer += delta;
  const safe = streamSafePrefix(rawStreamBuffer);
  if (safe === '') {
    return;
  }
  const target = pipeline;
  if (target === null) {
    return;
  }
  rawStreamBuffer = rawStreamBuffer.slice(safe.length);
  target.enqueue(cleanTextForSpeech(safe));
}

export function flushVoice(owner: symbol): void {
  if (currentOwner !== owner || pipeline === null) {
    return;
  }
  const rest = rawStreamBuffer;
  rawStreamBuffer = '';
  if (rest !== '') {
    pipeline.enqueue(cleanTextForSpeech(rest));
  }
  pipeline.flush();
}

export function stopVoice(): void {
  pipeline?.stop();
  currentOwner = null;
  rawStreamBuffer = '';
  publish();
}

export function pauseVoice(): void {
  pipeline?.pause();
}

export function resumeVoice(): void {
  pipeline?.resume();
}

export function onVoiceError(cb: (error: unknown) => void): () => void {
  errorListeners.add(cb);
  return () => {
    errorListeners.delete(cb);
  };
}

export function getVoiceRate(): number {
  return voiceRate;
}

export function setVoiceRate(rate: number): void {
  voiceRate = rate;
  setSpeechRate(rate);
  rateApplier?.(rate);
}
