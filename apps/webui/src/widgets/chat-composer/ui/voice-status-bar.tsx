import { PauseIcon, PlayIcon, SquareIcon } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import {
  getVoiceRate,
  getVoiceSnapshot,
  pauseVoice,
  resumeVoice,
  setVoiceRate,
  stopVoice,
  subscribeVoice,
} from '@/shared/lib/voice-store';
import { Button } from '@/shared/ui/button';
import { Slider } from '@/shared/ui/slider';
import './voice-status-bar.css';

const WAVE_BARS = [0, 1, 2, 3, 4];

export function VoiceStatusBar() {
  const snapshot = useSyncExternalStore(subscribeVoice, getVoiceSnapshot);
  const [rate, setRate] = useState(getVoiceRate);
  if (snapshot.status === 'idle') {
    return null;
  }
  const paused = snapshot.status === 'paused';
  return (
    <div
      className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-background px-3 py-1.5"
      data-testid="voice-status-bar"
    >
      <div className="flex min-w-0 items-center gap-2 text-muted-foreground text-xs">
        <span className="voice-wave" aria-hidden data-paused={paused ? 'true' : undefined}>
          {WAVE_BARS.map((bar) => (
            <i key={bar} />
          ))}
        </span>
        <span className="truncate">Reading aloud…</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="w-9 text-right font-mono text-muted-foreground text-xs" aria-hidden>
          {rate}×
        </span>
        <div className="w-32">
          <Slider
            min={0.5}
            max={2}
            step={0.25}
            value={rate}
            aria-label="Playback speed"
            onValueChange={(next) => {
              const parsed = Array.isArray(next) ? next[0] : next;
              if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
                return;
              }
              setVoiceRate(parsed);
              setRate(parsed);
            }}
          />
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={paused ? resumeVoice : pauseVoice}
          aria-label={paused ? 'Resume reading' : 'Pause reading'}
          title={paused ? 'Resume reading' : 'Pause reading'}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={stopVoice}
          aria-label="Stop reading"
          title="Stop reading"
        >
          <SquareIcon className="fill-current" />
        </Button>
      </div>
    </div>
  );
}
