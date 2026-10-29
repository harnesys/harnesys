import type { ModelKind, ProviderPublic } from '@harnesys/studio-shared';
import { driverMechanism } from '@harnesys/studio-shared';
import { getActiveOrgId } from './active-org';
import { apiJson, apiUrl } from './client';
import { authenticatedFetch } from './session';

export interface OrgModelRef {
  provider: string;
  model: string;
}

export function findOrgModelByKind(
  providers: ProviderPublic[],
  kind: ModelKind,
): OrgModelRef | undefined {
  for (const provider of providers) {
    if (!provider.enabled || driverMechanism(provider.driver, kind) === 'none') {
      continue;
    }
    const model = provider.models.find((entry) => entry.kind === kind);
    if (model) {
      return { provider: provider.name, model: model.name };
    }
  }
  return undefined;
}

export interface TranscribeAudioInput {
  ref: OrgModelRef;
  audioBase64: string;
  mimeType?: string;
}

export interface TranscriptionResult {
  text: string;
  durationInSeconds?: number;
}

export function transcribeAudio(input: TranscribeAudioInput): Promise<TranscriptionResult> {
  const orgId = getActiveOrgId();
  if (!orgId) {
    return Promise.reject(new Error('active org required'));
  }
  return apiJson<TranscriptionResult>(`/api/orgs/${orgId}/model-execution/transcription`, {
    method: 'POST',
    body: JSON.stringify({
      provider: input.ref.provider,
      model: input.ref.model,
      audioBase64: input.audioBase64,
      ...(input.mimeType ? { mimeType: input.mimeType } : {}),
    }),
  });
}

export interface SynthesizeSpeechInput {
  ref: OrgModelRef;
  text: string;
  voice?: string;
}

export interface OrgVoiceOption {
  id: string;
  name: string;
}

export async function fetchOrgVoices(provider: string, model: string): Promise<OrgVoiceOption[]> {
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new Error('active org required');
  }
  const query = `provider=${encodeURIComponent(provider)}&model=${encodeURIComponent(model)}`;
  const response = await authenticatedFetch(
    apiUrl(`/api/orgs/${orgId}/model-execution/voices?${query}`),
  );
  if (!response.ok) {
    throw new Error(`voice catalog unavailable (${response.status})`);
  }
  const data = (await response.json()) as { voices?: unknown };
  if (!Array.isArray(data.voices)) {
    return [];
  }
  const voices: OrgVoiceOption[] = [];
  for (const entry of data.voices) {
    if (typeof entry === 'object' && entry !== null) {
      const record = entry as Record<string, unknown>;
      if (typeof record.id === 'string' && record.id !== '') {
        voices.push({
          id: record.id,
          name: typeof record.name === 'string' && record.name !== '' ? record.name : record.id,
        });
      }
    }
  }
  return voices;
}

export async function synthesizeSpeech(input: SynthesizeSpeechInput): Promise<Blob> {
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new Error('active org required');
  }
  const response = await authenticatedFetch(apiUrl(`/api/orgs/${orgId}/model-execution/speech`), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: input.ref.provider,
      model: input.ref.model,
      text: input.text,
      ...(input.voice ? { voice: input.voice } : {}),
    }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { message?: string } | undefined;
    throw new Error(body?.message ?? `speech synthesis failed (${response.status})`);
  }
  return response.blob();
}
