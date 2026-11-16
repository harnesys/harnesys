import { useQuery } from '@tanstack/react-query';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { type Control, Controller, useFieldArray, useWatch } from 'react-hook-form';
import { fetchOrgVoices } from '@/shared/api/model-execution';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import type { ModelFieldsInput } from '../model/model-fields';
import { emptySpeechVoiceFields, SPEECH_FORMAT_ITEMS } from '../model/model-speech-fields';

export function SpeechSettings({
  control,
  speechSource,
}: {
  control: Control<ModelFieldsInput>;
  speechSource?: { provider: string; model: string };
}) {
  const { fields, append, remove } = useFieldArray({ control, name: 'speech.voices' });
  const voices = useWatch({ control, name: 'speech.voices' }) ?? [];
  const configuredIds = new Set(voices.map((voice) => voice.id));
  const provider = speechSource?.provider ?? '';
  const model = speechSource?.model ?? '';
  const discovered = useQuery({
    queryKey: ['org-voices', provider, model],
    queryFn: () => fetchOrgVoices(provider, model),
    enabled: provider !== '' && model !== '',
  });
  const discoveredVoices = discovered.data ?? [];
  function addVoice(id: string, name: string): void {
    if (configuredIds.has(id)) {
      return;
    }
    append({ name, id, params: '' });
  }
  return (
    <Field>
      <FieldLabel>Speech</FieldLabel>
      <FieldDescription>
        Response format, the provider field that carries the voice, and the voice catalog.
      </FieldDescription>
      <div className="grid grid-cols-2 gap-4">
        <Controller
          control={control}
          name="speech.responseFormat"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="model-speech-format">Response format</FieldLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="model-speech-format" className="w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPEECH_FORMAT_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="speech.voiceParam"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="model-speech-voice-param">Voice field</FieldLabel>
              <Input
                id="model-speech-voice-param"
                className="font-mono"
                placeholder="voice"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                name={field.name}
                ref={field.ref}
              />
            </Field>
          )}
        />
      </div>
      <Controller
        control={control}
        name="speech.sampleRate"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor="model-speech-sample-rate">PCM sample rate (Hz)</FieldLabel>
            <Input
              id="model-speech-sample-rate"
              className="font-mono"
              inputMode="numeric"
              placeholder="24000"
              aria-invalid={fieldState.invalid || undefined}
              value={typeof field.value === 'string' ? field.value : ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              ref={field.ref}
            />
            <FieldDescription>Used to wrap raw PCM output into a playable WAV.</FieldDescription>
            {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
          </Field>
        )}
      />
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">Voices</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => append(emptySpeechVoiceFields())}
          >
            <PlusIcon className="size-3.5" />
            Add voice
          </Button>
        </div>
        {discoveredVoices.length > 0 ? (
          <div className="flex flex-col gap-1.5 rounded-lg border border-dashed p-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Available from provider</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-1.5 text-xs"
                onClick={() => {
                  for (const voice of discoveredVoices) {
                    addVoice(voice.id, voice.name);
                  }
                }}
              >
                Add all
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {discoveredVoices.map((voice) => {
                const on = configuredIds.has(voice.id);
                return (
                  <button
                    key={voice.id}
                    type="button"
                    disabled={on}
                    onClick={() => addVoice(voice.id, voice.name)}
                    className={cn(
                      'inline-flex h-7 items-center rounded-md px-2 font-mono text-xs transition-colors',
                      on
                        ? 'bg-live/15 text-live'
                        : 'bg-muted/80 text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {voice.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {fields.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            No voices — the provider catalog or a manual voice ID is used.
          </p>
        ) : null}
        {fields.map((voice, index) => (
          <div key={voice.id} className="flex flex-col gap-2 rounded-lg border p-2">
            <div className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
              <Controller
                control={control}
                name={`speech.voices.${index}.name`}
                render={({ field }) => (
                  <Input
                    className="font-mono text-xs"
                    placeholder="Name (e.g. Maria)"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                    aria-label={`Voice ${index + 1} name`}
                  />
                )}
              />
              <Controller
                control={control}
                name={`speech.voices.${index}.id`}
                render={({ field }) => (
                  <Input
                    className="font-mono text-xs"
                    placeholder="ID sent to provider (e.g. maria)"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                    aria-label={`Voice ${index + 1} id`}
                  />
                )}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove voice ${index + 1}`}
                onClick={() => remove(index)}
              >
                <Trash2Icon />
              </Button>
            </div>
            <Controller
              control={control}
              name={`speech.voices.${index}.params`}
              render={({ field, fieldState }) => (
                <div className="flex flex-col gap-1">
                  <Input
                    className="font-mono text-xs"
                    placeholder='Extra params JSON (optional, e.g. {"emotion":"happy"})'
                    aria-invalid={fieldState.invalid || undefined}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                    aria-label={`Voice ${index + 1} extra params`}
                  />
                  {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
                </div>
              )}
            />
          </div>
        ))}
      </div>
    </Field>
  );
}
