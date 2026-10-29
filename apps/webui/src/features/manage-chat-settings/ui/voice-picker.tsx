import { useQuery } from '@tanstack/react-query';
import { CheckIcon, ChevronsUpDownIcon, SearchIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { fetchOrgVoices } from '@/shared/api/model-execution';
import { listVoices, onVoicesChanged } from '@/shared/lib/browser-speech';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

const SYSTEM_VOICE_VALUE = '';

interface VoicePickerProps {
  id: string;
  value: string;
  onChange(uri: string): void;
}

export function VoicePicker({ id, value, onChange }: VoicePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => listVoices());
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => onVoicesChanged(() => setVoices(listVoices())), []);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus());
      return;
    }
    setQuery('');
  }, [open]);

  const needle = query.trim().toLowerCase();
  const filtered = voices.filter(
    (voice) => !needle || `${voice.name} ${voice.lang}`.toLowerCase().includes(needle),
  );
  const selected = voices.find((voice) => voice.voiceURI === value);
  const selectedLabel = value === SYSTEM_VOICE_VALUE ? 'System default' : (selected?.name ?? value);

  function pick(uri: string): void {
    onChange(uri);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-between font-normal"
          />
        }
      >
        <span className="min-w-0 truncate">{selectedLabel}</span>
        <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            placeholder="Search voices"
            className="h-8 pl-8"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="mt-2 max-h-64 overflow-y-auto">
          <button
            type="button"
            onClick={() => pick(SYSTEM_VOICE_VALUE)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <span className="min-w-0 flex-1 truncate">System default</span>
            {value === SYSTEM_VOICE_VALUE ? <CheckIcon className="size-4 shrink-0" /> : null}
          </button>
          {filtered.map((voice) => (
            <button
              key={voice.voiceURI}
              type="button"
              onClick={() => pick(voice.voiceURI)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <span className="min-w-0 flex-1 truncate">
                {voice.name} <span className="text-muted-foreground">({voice.lang})</span>
              </span>
              {value === voice.voiceURI ? <CheckIcon className="size-4 shrink-0" /> : null}
            </button>
          ))}
          {filtered.length === 0 ? (
            <div className="px-2 py-4 text-center text-muted-foreground text-sm">
              No voices match
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface ModelVoiceItem {
  value: string;
  label: string;
}

const loadingVoiceItems: ModelVoiceItem[] = [{ value: 'loading', label: 'Loading voices…' }];

interface ModelVoicePickerProps {
  id: string;
  provider: string;
  model: string;
  value: string;
  onChange(voice: string | null): void;
}

export function ModelVoicePicker({ id, provider, model, value, onChange }: ModelVoicePickerProps) {
  const voicesQuery = useQuery({
    queryKey: ['org-voices', provider, model],
    queryFn: () => fetchOrgVoices(provider, model),
  });

  if (voicesQuery.isPending) {
    return (
      <Select items={loadingVoiceItems} value="loading" onValueChange={() => undefined}>
        <SelectTrigger id={id} size="sm" className="w-full" disabled>
          <SelectValue />
        </SelectTrigger>
      </Select>
    );
  }

  if (voicesQuery.isError) {
    return (
      <div className="flex w-full flex-col gap-1">
        <Input
          id={id}
          value={value}
          placeholder="Voice ID"
          onChange={(event) => onChange(event.target.value || null)}
        />
        <p className="text-muted-foreground text-xs">
          Manual entry · No voice discovery for this provider — enter the voice ID manually.
        </p>
      </div>
    );
  }

  const items: ModelVoiceItem[] = [
    { value: '', label: 'Model default' },
    ...(voicesQuery.data ?? []).map((voice) => ({ value: voice.id, label: voice.name })),
  ];

  return (
    <div className="flex w-full flex-col gap-1">
      <Select items={items} value={value} onValueChange={(next) => onChange(next ?? null)}>
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
      <p className="text-muted-foreground text-xs">Discovered via API</p>
    </div>
  );
}
