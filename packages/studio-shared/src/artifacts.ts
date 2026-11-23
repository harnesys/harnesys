import type { SessionEvent } from 'harnesys';

export interface RunArtifact {
  attachmentId: string;
  name: string;
  mediaType: string;
  sizeBytes?: number;
}

export type JsonObject = Record<string, unknown>;

export interface ArtifactToolEvent {
  name?: string;
  phase?: string;
  output?: unknown;
}

export function parseJson(raw: string | undefined): unknown {
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function asObject(value: unknown): JsonObject | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as JsonObject;
}

export function str(value: JsonObject | undefined, key: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const field = value[key];
  return typeof field === 'string' ? field : undefined;
}

export function num(value: JsonObject | undefined, key: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const field = value[key];
  return typeof field === 'number' && Number.isFinite(field) ? field : undefined;
}

export function parseFileArtifact(tool: ArtifactToolEvent): RunArtifact | null {
  if (tool.phase !== 'completed' || tool.name !== 'gmail_download_attachment') {
    return null;
  }
  const output = typeof tool.output === 'string' ? parseJson(tool.output) : tool.output;
  const obj = asObject(output);
  const attachmentId = str(obj, 'attachmentId');
  const mediaType = str(obj, 'mediaType');
  if (!obj || !attachmentId || !mediaType) {
    return null;
  }
  return {
    attachmentId,
    name: str(obj, 'filename') ?? attachmentId,
    mediaType,
    sizeBytes: num(obj, 'size'),
  };
}

export function parseImageArtifact(tool: ArtifactToolEvent): RunArtifact | null {
  if (tool.phase !== 'completed' || tool.name !== 'image_generate') {
    return null;
  }
  const output = typeof tool.output === 'string' ? parseJson(tool.output) : tool.output;
  const obj = asObject(output);
  const attachmentId = str(obj, 'attachmentId');
  const mediaType = str(obj, 'mediaType');
  if (!obj || !attachmentId || !mediaType) {
    return null;
  }
  return { attachmentId, name: str(obj, 'name') ?? attachmentId, mediaType };
}

export function extractRunArtifacts(events: SessionEvent[]): RunArtifact[] {
  const seen = new Set<string>();
  const artifacts: RunArtifact[] = [];
  for (const event of events) {
    if (event.type !== 'tool') {
      continue;
    }
    const artifact = parseFileArtifact(event) ?? parseImageArtifact(event);
    if (!artifact || seen.has(artifact.attachmentId)) {
      continue;
    }
    seen.add(artifact.attachmentId);
    artifacts.push(artifact);
  }
  return artifacts;
}
