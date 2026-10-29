import type { ModelBinding } from 'harnesys';

export interface VoiceOption {
  id: string;
  name: string;
}

export abstract class VoiceCatalogPort {
  abstract list(binding: ModelBinding): Promise<VoiceOption[]>;
}
