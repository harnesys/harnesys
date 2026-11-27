import type { SessionEvent } from 'harnesys';

export interface RunArtifact {
  attachmentId: string;
  name: string;
  mediaType: string;
  sizeBytes?: number;
}

export type JsonObject = Record<string, unknown>;

export interface ArtifactToolEvent {
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

export interface RunLinkTarget {
  source: 'thread' | 'project';
  threadId?: string;
  projectId?: string;
  path: string;
  worktreeId?: string;
}

export interface RunLinkArtifact {
  target: RunLinkTarget;
  name: string;
  mediaType: string;
  sizeBytes?: number;
}

function artifactOutputOf(tool: ArtifactToolEvent): JsonObject | undefined {
  if (tool.phase !== 'completed') {
    return undefined;
  }
  const output = typeof tool.output === 'string' ? parseJson(tool.output) : tool.output;
  return asObject(output);
}

function parseAttachmentArtifact(tool: ArtifactToolEvent): RunArtifact | null {
  const obj = artifactOutputOf(tool);
  const attachmentId = str(obj, 'attachmentId');
  const mediaType = str(obj, 'mediaType');
  if (!obj || !attachmentId || !mediaType) {
    return null;
  }
  return {
    attachmentId,
    name: str(obj, 'name') ?? str(obj, 'filename') ?? attachmentId,
    mediaType,
    sizeBytes: num(obj, 'size') ?? num(obj, 'sizeBytes'),
  };
}

function isImage(mediaType: string): boolean {
  return mediaType.startsWith('image/');
}

export function parseFileArtifact(tool: ArtifactToolEvent): RunArtifact | null {
  const artifact = parseAttachmentArtifact(tool);
  return artifact !== null && !isImage(artifact.mediaType) ? artifact : null;
}

export function parseImageArtifact(tool: ArtifactToolEvent): RunArtifact | null {
  const artifact = parseAttachmentArtifact(tool);
  return artifact !== null && isImage(artifact.mediaType) ? artifact : null;
}

export function parseLinkArtifact(tool: ArtifactToolEvent): RunLinkArtifact | null {
  const obj = artifactOutputOf(tool);
  const link = obj ? asObject(obj.link) : undefined;
  const source = str(link, 'source');
  const path = str(link, 'path');
  const mediaType = str(obj, 'mediaType');
  if (!link || !path || !mediaType) {
    return null;
  }
  if (source === 'thread') {
    const threadId = str(link, 'threadId');
    if (!threadId) {
      return null;
    }
    return linkArtifact({ source, threadId, path }, obj, mediaType);
  }
  if (source === 'project') {
    const projectId = str(link, 'projectId');
    if (!projectId) {
      return null;
    }
    const worktreeId = str(link, 'worktreeId');
    return linkArtifact(
      { source, projectId, path, ...(worktreeId !== undefined ? { worktreeId } : {}) },
      obj,
      mediaType,
    );
  }
  return null;
}

function linkArtifact(
  target: RunLinkTarget,
  obj: JsonObject | undefined,
  mediaType: string,
): RunLinkArtifact {
  return {
    target,
    name: str(obj, 'name') ?? target.path.split('/').pop() ?? target.path,
    mediaType,
    sizeBytes: num(obj, 'size') ?? num(obj, 'sizeBytes'),
  };
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
