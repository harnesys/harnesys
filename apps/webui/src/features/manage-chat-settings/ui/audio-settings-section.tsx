import type { ProviderPublic } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { getActiveOrgId } from '@/shared/api/active-org';
import { synthesizeSpeech } from '@/shared/api/model-execution';
import { providersQuery } from '@/shared/api/providers';
import {
  getBrowserVoiceUri,
  getDictationLang,
  getSpeechRate,
  setBrowserVoiceUri,
  setDictationLang,
  setSpeechRate,
  type VoiceModelKind,
  type VoiceSource,
} from '@/shared/api/voice-prefs';
import { cancelSpeak, speak } from '@/shared/lib/browser-speech';
import { Button } from '@/shared/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { SettingsField, SettingsSection } from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';
import { sourceKey, sourceLabel, useVoiceSource } from '@/shared/ui/voice-source-menu';
import { TranscriptionPreview } from './transcription-preview';
import { ModelVoicePicker, VoicePicker } from './voice-picker';

const SPEECH_RATES = [0.75, 1, 1.25, 1.5];

const DICTATION_LANGS = [
  '',
  'en-US',
  'ru-RU',
  'de-DE',
  'es-ES',
  'fr-FR',
  'pt-BR',
  'zh-CN',
  'ja-JP',
];

const PREVIEW_TEXT = 'This is how the assistant will read messages aloud.';

interface SelectOption {
  value: string;
  label: string;
}

interface ModelSpeechRef {
  provider: string;
  model: string;
  voice?: string;
}

const rateItems: SelectOption[] = SPEECH_RATES.map((value) => ({
  value: String(value),
  label: `${value}×`,
}));

const dictationLangItems: SelectOption[] = DICTATION_LANGS.map((lang) => ({
  value: lang,
  label: lang === '' ? 'System default' : lang,
}));

function useVoiceSelect(kind: VoiceModelKind) {
  const providers: ProviderPublic[] = useQuery(providersQuery(getActiveOrgId() ?? '')).data ?? [];
  const voice = useVoiceSource(kind, providers);
  const items: SelectOption[] = voice.options.map((option) => ({
    value: sourceKey(option),
    label: sourceLabel(option),
  }));
  function pickKey(value: string | null): void {
    const next = voice.options.find((option) => sourceKey(option) === value);
    if (next) {
      voice.pick(next);
    }
  }
  return { voice, items, pickKey };
}

function SourceSelect({
  id,
  items,
  value,
  onPick,
}: {
  id: string;
  items: SelectOption[];
  value: string;
  onPick(value: string | null): void;
}) {
  return (
    <Select items={items} value={value} onValueChange={onPick}>
      <SelectTrigger id={id} size="sm" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" className="w-full">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AudioSettingsSection() {
  const speech = useVoiceSelect('speech');
  const dictation = useVoiceSelect('transcription');
  const [voiceUri, setVoiceUriState] = useState<string>(() => getBrowserVoiceUri() ?? '');
  const [rate, setRateState] = useState<number>(() => getSpeechRate());
  const [dictationLang, setDictationLangState] = useState<string>(() => getDictationLang() ?? '');
  const [speaking, setSpeaking] = useState(false);
  const speakingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | undefined>(undefined);
  const previewUrlRef = useRef<string | undefined>(undefined);

  const speechSource = speech.voice.source;
  const browserSpeech = speechSource?.kind === 'browser';
  const modelSpeech = speechSource?.kind === 'model' ? speechSource : undefined;
  const browserDictation = dictation.voice.options.some((option) => option.kind === 'browser');
  const hasDictation = dictation.items.length > 0;

  function stopPreviewAudio(): void {
    const audio = audioRef.current;
    audioRef.current = undefined;
    if (audio) {
      audio.pause();
    }
    const url = previewUrlRef.current;
    previewUrlRef.current = undefined;
    if (url) {
      URL.revokeObjectURL(url);
    }
  }

  function finishPreview(): void {
    speakingRef.current = false;
    setSpeaking(false);
  }

  function endModelPreview(): void {
    stopPreviewAudio();
    finishPreview();
  }

  useEffect(() => {
    return () => {
      if (speakingRef.current) {
        cancelSpeak();
      }
      audioRef.current?.pause();
      const url = previewUrlRef.current;
      previewUrlRef.current = undefined;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  function applyVoiceUri(uri: string): void {
    setVoiceUriState(uri);
    setBrowserVoiceUri(uri);
  }

  function applyRate(next: number): void {
    setRateState(next);
    setSpeechRate(next);
  }

  function applyDictationLang(lang: string): void {
    setDictationLangState(lang);
    setDictationLang(lang);
  }

  function startModelPreview(source: ModelSpeechRef): void {
    synthesizeSpeech({
      ref: { provider: source.provider, model: source.model },
      text: PREVIEW_TEXT,
      voice: source.voice,
    })
      .then((blob) => {
        if (!speakingRef.current) {
          return;
        }
        stopPreviewAudio();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        previewUrlRef.current = url;
        audio.onended = endModelPreview;
        audio.onerror = endModelPreview;
        void audio.play().catch(endModelPreview);
      })
      .catch(() => {
        finishPreview();
        toast.add({ title: 'Preview failed' });
      });
  }

  function startPreview(source: VoiceSource): void {
    speakingRef.current = true;
    setSpeaking(true);
    if (source.kind === 'browser') {
      speak(
        PREVIEW_TEXT,
        { voiceUri: voiceUri || null, rate },
        {
          onEnd: finishPreview,
          onError: finishPreview,
        },
      );
      return;
    }
    startModelPreview(source);
  }

  function stopPreview(): void {
    speakingRef.current = false;
    cancelSpeak();
    stopPreviewAudio();
    finishPreview();
  }

  function togglePreview(): void {
    if (speaking) {
      stopPreview();
      return;
    }
    const source = speech.voice.source;
    if (source) {
      startPreview(source);
    }
  }

  return (
    <SettingsSection label="Audio" description="Voice input and read-aloud for chat.">
      <SettingsField
        label="Read aloud"
        description="Chooses the browser or model voice used to read messages aloud."
        htmlFor="audio-read-aloud-select"
      >
        <SourceSelect
          id="audio-read-aloud-select"
          items={speech.items}
          value={speechSource ? sourceKey(speechSource) : ''}
          onPick={speech.pickKey}
        />
      </SettingsField>
      {speechSource ? (
        <SettingsField
          label="Voice"
          description={
            browserSpeech
              ? 'Browser voice used for read-aloud.'
              : 'Voice sent to the model for read-aloud.'
          }
          htmlFor="audio-voice-select"
        >
          {browserSpeech ? (
            <VoicePicker id="audio-voice-select" value={voiceUri} onChange={applyVoiceUri} />
          ) : null}
          {modelSpeech ? (
            <ModelVoicePicker
              id="audio-voice-select"
              provider={modelSpeech.provider}
              model={modelSpeech.model}
              value={modelSpeech.voice ?? ''}
              onChange={speech.voice.setVoice}
            />
          ) : null}
        </SettingsField>
      ) : null}
      {browserSpeech ? (
        <SettingsField
          label="Speed"
          description="Playback speed for browser read-aloud."
          htmlFor="audio-speed-select"
        >
          <SourceSelect
            id="audio-speed-select"
            items={rateItems}
            value={String(rate)}
            onPick={(value) => {
              const parsed = Number(value);
              if (SPEECH_RATES.includes(parsed)) {
                applyRate(parsed);
              }
            }}
          />
        </SettingsField>
      ) : null}
      {speechSource ? (
        <SettingsField label="Preview" description="Hear the active read-aloud source.">
          <Button type="button" variant="outline" size="sm" onClick={togglePreview}>
            {speaking ? 'Stop' : 'Preview'}
          </Button>
        </SettingsField>
      ) : null}
      {hasDictation ? (
        <SettingsField
          label="Dictation"
          description="Chooses the browser or model engine used for microphone dictation."
          htmlFor="audio-dictation-select"
        >
          <SourceSelect
            id="audio-dictation-select"
            items={dictation.items}
            value={dictation.voice.source ? sourceKey(dictation.voice.source) : ''}
            onPick={dictation.pickKey}
          />
        </SettingsField>
      ) : null}
      {hasDictation && dictation.voice.source ? (
        <SettingsField
          label="Dictation test"
          description="Record a short phrase and see the text the selected engine returns."
        >
          <TranscriptionPreview source={dictation.voice.source} />
        </SettingsField>
      ) : null}
      {browserDictation ? (
        <SettingsField
          label="Dictation language"
          description="Recognition language for browser dictation; System default follows the browser locale."
          htmlFor="audio-dictation-lang-select"
        >
          <SourceSelect
            id="audio-dictation-lang-select"
            items={dictationLangItems}
            value={dictationLang}
            onPick={applyDictationLang}
          />
        </SettingsField>
      ) : null}
    </SettingsSection>
  );
}
