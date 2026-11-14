export interface AttachmentSourceInput {
  orgId: string;
  path: string;
}

export interface AttachmentSourceResult {
  name: string;
  mediaType: string;
  bytes: Uint8Array;
}

export abstract class AddonAttachmentSourcePort {
  abstract read(input: AttachmentSourceInput): Promise<AttachmentSourceResult>;
}
