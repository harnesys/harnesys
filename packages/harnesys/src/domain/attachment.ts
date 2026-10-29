export type SendFile =
  | {
      path: string;
      name?: string;
      mediaType?: string;
    }
  | {
      bytes: Uint8Array;
      name?: string;
      mediaType?: string;
    };
export type AttachmentKind = 'image' | 'audio' | 'video' | 'file';
export interface Attachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  mediaType: string;
  path: string;
}
