import { Loader2Icon, MicIcon, SquareIcon } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { transcribeAudio } from '@/shared/api/model-execution';
import { getDictationLang, type VoiceSource } from '@/shared/api/voice-prefs';
import { type DictationSession, startDictation } from '@/shared/lib/browser-speech';
import { createVoiceRecorder, type VoiceRecorder } from '@/shared/lib/voice-recorder';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';

type PreviewPhase = 'idle' | 'recording' | 'transcribing';

export function TranscriptionPreview({ source }: { source: VoiceSource }) {
  const [phase, setPhase] = useState<PreviewPhase>('idle');
  const [text, setText] = useState('');
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const sessionRef = useRef<DictationSession | null>(null);
  const pendingRef = useRef<VoiceSource | null>(null);
  useEffect(
    () => () => {
      recorderRef.current?.dispose();
      sessionRef.current?.stop();
    },
    [],
  );
  function toggle(): void {
    if (recorderRef.current) {
      void finish(recorderRef.current);
      return;
    }
    if (sessionRef.current) {
      sessionRef.current.stop();
      return;
    }
    if (source.kind === 'browser') {
      beginDictation();
      return;
    }
    void begin();
  }
  const phaseIcon: Record<PreviewPhase, ReactNode> = {
    idle: <MicIcon />,
    recording: <SquareIcon className="text-destructive" />,
    transcribing: <Loader2Icon className="animate-spin" />,
  };
  const phaseLabel: Record<PreviewPhase, string> = {
    idle: 'Record',
    recording: 'Stop',
    transcribing: 'Transcribing…',
  };
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" disabled={phase === 'transcribing'} onClick={toggle}>
          {phaseIcon[phase]}
          {phaseLabel[phase]}
        </Button>
      </div>
      <p className="text-muted-foreground text-sm leading-5">
        {text || 'Record a short phrase to test the selected engine.'}
      </p>
    </div>
  );
  async function begin(): Promise<void> {
    const recorder = createVoiceRecorder({ onStart: () => setPhase('recording') });
    try {
      await recorder.start();
      recorderRef.current = recorder;
      pendingRef.current = source;
    } catch {
      recorder.dispose();
      toast.add({ title: 'Microphone access denied' });
    }
  }
  function beginDictation(): void {
    const chunks: string[] = [];
    const session = startDictation(getDictationLang(), {
      onInterim: () => {},
      onFinal: (chunk) => {
        chunks.push(chunk);
        setText(chunks.join(' ').trim());
      },
      onError: (message) => {
        toast.add({ title: message });
      },
      onEnd: () => {
        sessionRef.current = null;
        setPhase('idle');
      },
    });
    if (!session) {
      toast.add({ title: 'Speech recognition is not supported in this browser' });
      return;
    }
    sessionRef.current = session;
    setPhase('recording');
  }
  async function finish(recorder: VoiceRecorder): Promise<void> {
    recorderRef.current = null;
    const target = pendingRef.current;
    pendingRef.current = null;
    if (target?.kind !== 'model') {
      setPhase('idle');
      return;
    }
    setPhase('transcribing');
    try {
      const recording = await recorder.stop();
      const result = await transcribeAudio({
        ref: target,
        audioBase64: recording.audioBase64,
        mimeType: recording.mimeType,
      });
      setText(result.text.trim());
    } catch {
      toast.add({ title: 'Transcription failed' });
    } finally {
      setPhase('idle');
    }
  }
}
