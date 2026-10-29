import type { ProviderPublic } from '@harnesys/studio-shared';
import { Loader2Icon, MicIcon, SquareIcon } from 'lucide-react';
import { InputGroupButton } from '@/shared/ui/input-group';
import { useVoiceSource } from '@/shared/ui/voice-source-menu';
import { useVoiceInput, type VoiceInputState } from '../model/voice-input';

function MicButton({ state, onToggle }: { state: VoiceInputState; onToggle(): void }) {
  if (state === 'recording') {
    return (
      <InputGroupButton size="icon-xs" variant="ghost" title="Stop recording" onClick={onToggle}>
        <SquareIcon className="text-destructive" />
        <span className="sr-only">Stop recording</span>
      </InputGroupButton>
    );
  }
  if (state === 'transcribing') {
    return (
      <InputGroupButton size="icon-xs" variant="ghost" disabled title="Transcribing">
        <Loader2Icon className="animate-spin" />
        <span className="sr-only">Transcribing</span>
      </InputGroupButton>
    );
  }
  return (
    <InputGroupButton size="icon-xs" variant="ghost" title="Record voice input" onClick={onToggle}>
      <MicIcon />
      <span className="sr-only">Record voice input</span>
    </InputGroupButton>
  );
}

export function VoiceInputButton({
  providers,
  onInsertText,
}: {
  providers: ProviderPublic[];
  onInsertText(text: string): void;
}) {
  const voice = useVoiceSource('transcription', providers);
  const input = useVoiceInput({ source: voice.source, onInsertText });
  if (!voice.source) {
    return null;
  }
  return <MicButton state={input.state} onToggle={input.toggle} />;
}
