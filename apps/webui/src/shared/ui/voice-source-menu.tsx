import type { ProviderPublic } from '@harnesys/studio-shared';
import { driverMechanism } from '@harnesys/studio-shared';
import { useState } from 'react';
import { getActiveOrgId } from '@/shared/api/active-org';
import {
  getVoiceSource,
  setVoiceSource,
  type VoiceModelKind,
  type VoiceSource,
} from '@/shared/api/voice-prefs';
import { browserSttSupported, browserTtsSupported } from '@/shared/lib/browser-speech';

function browserSupportedFor(kind: VoiceModelKind): boolean {
  return kind === 'speech' ? browserTtsSupported() : browserSttSupported();
}

function sameSource(left: VoiceSource, right: VoiceSource): boolean {
  if (left.kind === 'browser' && right.kind === 'browser') {
    return true;
  }
  if (left.kind === 'model' && right.kind === 'model') {
    return left.provider === right.provider && left.model === right.model;
  }
  return false;
}

export function sourceLabel(source: VoiceSource): string {
  return source.kind === 'browser' ? 'Browser (built-in)' : `${source.provider} / ${source.model}`;
}

export function sourceKey(source: VoiceSource): string {
  return source.kind === 'browser' ? 'browser' : `${source.provider}/${source.model}`;
}

export function useVoiceSource(
  kind: VoiceModelKind,
  providers: ProviderPublic[],
): {
  source: VoiceSource | undefined;
  options: VoiceSource[];
  pick(source: VoiceSource): void;
  setVoice(voice: string | null): void;
} {
  const orgId = getActiveOrgId() ?? '';
  const [picked, setPicked] = useState<VoiceSource | undefined>(undefined);
  const options: VoiceSource[] = [];
  if (browserSupportedFor(kind)) {
    options.push({ kind: 'browser' });
  }
  for (const provider of providers) {
    if (!provider.enabled || driverMechanism(provider.driver, kind) === 'none') {
      continue;
    }
    for (const model of provider.models) {
      if (model.kind === kind) {
        options.push({ kind: 'model', provider: provider.name, model: model.name });
      }
    }
  }
  const stored = getVoiceSource(orgId, kind) ?? undefined;
  const storedValid =
    stored && options.some((option) => sameSource(option, stored)) ? stored : undefined;
  const firstModel = options.find((option) => option.kind === 'model');
  const resolved = picked ?? storedValid ?? firstModel ?? options[0];
  function pick(next: VoiceSource): void {
    setPicked(next);
    setVoiceSource(orgId, kind, next);
  }
  function setVoice(voice: string | null): void {
    const current = resolved;
    if (current?.kind !== 'model') {
      return;
    }
    const next: VoiceSource = { kind: 'model', provider: current.provider, model: current.model };
    if (voice !== null && voice !== '') {
      next.voice = voice;
    }
    setPicked(next);
    setVoiceSource(orgId, kind, next);
  }
  return { source: resolved, options, pick, setVoice };
}
