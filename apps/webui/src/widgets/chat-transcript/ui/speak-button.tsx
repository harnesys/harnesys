import { useQuery } from '@tanstack/react-query';
import { SquareIcon, Volume2Icon } from 'lucide-react';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { getActiveOrgId } from '@/shared/api/active-org';
import { providersQuery } from '@/shared/api/providers';
import type { VoiceSource } from '@/shared/api/voice-prefs';
import { getVoiceSnapshot, speakText, stopVoice, subscribeVoice } from '@/shared/lib/voice-store';
import { Button } from '@/shared/ui/button';
import { useVoiceSource } from '@/shared/ui/voice-source-menu';

export function SpeakButton({ text }: { text: string }) {
  const providers = useQuery(providersQuery(getActiveOrgId() ?? '')).data ?? [];
  const voice = useVoiceSource('speech', providers);
  const ownerRef = useRef<symbol | null>(null);
  const snapshot = useSyncExternalStore(subscribeVoice, getVoiceSnapshot);
  useEffect(() => {
    return () => {
      const current = getVoiceSnapshot();
      if (current.owner !== null && current.owner === ownerRef.current) {
        stopVoice();
      }
    };
  }, []);
  if (!text.trim() || !voice.source) {
    return null;
  }
  const source: VoiceSource = voice.source;
  const playing = snapshot.status !== 'idle' && snapshot.owner === ownerRef.current;
  const label = playing ? 'Stop' : 'Read aloud';
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="text-muted-foreground hover:bg-transparent hover:text-foreground"
      onClick={() => {
        if (playing) {
          stopVoice();
          return;
        }
        const owner = Symbol('speak-button');
        ownerRef.current = owner;
        speakText(owner, source, text);
      }}
      aria-label={label}
      title={label}
    >
      {playing ? <SquareIcon className="fill-current" /> : <Volume2Icon />}
    </Button>
  );
}
