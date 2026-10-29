import { useEffect, useRef, useState } from 'react';
import { transcribeAudio } from '@/shared/api/model-execution';
import { getDictationLang, type VoiceSource } from '@/shared/api/voice-prefs';
import { type DictationSession, startDictation } from '@/shared/lib/browser-speech';
import { createVoiceRecorder, type VoiceRecorder } from '@/shared/lib/voice-recorder';
import { toast } from '@/shared/ui/toast';

export type VoiceInputState = 'idle' | 'recording' | 'transcribing';

export interface UseVoiceInputArgs {
  source: VoiceSource | undefined;
  onInsertText(text: string): void;
}

export interface VoiceInput {
  state: VoiceInputState;
  toggle(): void;
}

export function useVoiceInput({ source, onInsertText }: UseVoiceInputArgs): VoiceInput {
  const [state, setState] = useState<VoiceInputState>('idle');
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const sessionRef = useRef<DictationSession | null>(null);
  const chunksRef = useRef<string[]>([]);
  const latest = useRef({ source, onInsertText });
  latest.current = { source, onInsertText };
  useEffect(
    () => () => {
      recorderRef.current?.dispose();
      sessionRef.current?.stop();
    },
    [],
  );
  function toggle(): void {
    const current = latest.current.source;
    if (!current) {
      return;
    }
    const recorder = recorderRef.current;
    if (recorder) {
      if (state === 'recording') {
        void finish(recorder);
      }
      return;
    }
    const session = sessionRef.current;
    if (session) {
      session.stop();
      return;
    }
    if (current.kind === 'browser') {
      beginDictation();
      return;
    }
    void begin();
  }
  return { state, toggle };
  async function begin(): Promise<void> {
    const recorder = createVoiceRecorder({ onStart: () => setState('recording') });
    try {
      await recorder.start();
      recorderRef.current = recorder;
    } catch {
      recorder.dispose();
      toast.add({ title: 'Microphone access denied' });
    }
  }
  function beginDictation(): void {
    chunksRef.current = [];
    const session = startDictation(getDictationLang(), {
      onInterim: () => {},
      onFinal: (chunk) => {
        chunksRef.current.push(chunk);
      },
      onError: (message) => {
        toast.add({ title: message });
      },
      onEnd: () => {
        finishDictation();
      },
    });
    if (!session) {
      toast.add({ title: 'Speech recognition is not supported in this browser' });
      return;
    }
    sessionRef.current = session;
    setState('recording');
  }
  function finishDictation(): void {
    sessionRef.current = null;
    const text = chunksRef.current.join(' ').trim();
    chunksRef.current = [];
    setState('idle');
    if (text) {
      latest.current.onInsertText(text);
    }
  }
  async function finish(recorder: VoiceRecorder): Promise<void> {
    recorderRef.current = null;
    setState('transcribing');
    try {
      const recording = await recorder.stop();
      const current = latest.current.source;
      if (current?.kind !== 'model') {
        return;
      }
      const result = await transcribeAudio({
        ref: current,
        audioBase64: recording.audioBase64,
        mimeType: recording.mimeType,
      });
      const text = result.text.trim();
      if (text) {
        latest.current.onInsertText(text);
      }
    } catch {
      toast.add({ title: 'Voice transcription failed' });
    } finally {
      setState('idle');
    }
  }
}
