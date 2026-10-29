export interface ConfirmPayload {
  approved: boolean;
}
export interface AskPayload {
  text?: string;
  optionIds?: string[];
}
export interface PermissionPayload {
  approved: boolean;
}
export type HitlPayload = ConfirmPayload | AskPayload | PermissionPayload;
export function payloadForSource(
  source: string,
  input: {
    approved?: boolean;
    text?: string;
    optionIds?: string[];
  },
): HitlPayload {
  if (source === 'permission' || source === 'approve') {
    return { approved: input.approved ?? false };
  }
  return { text: input.text, optionIds: input.optionIds };
}
