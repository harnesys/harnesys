import { access } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { trace } from '../../libs/trace.ts';
import type { EmbeddingsPort } from './embeddings.ts';
import { indexKnowledgeFile, upsertWalkEntry } from './knowledge-index-file.ts';
import type { SqliteKnowledgeIndexRepo } from './knowledge-index-repo.ts';
import { collectKnowledgePaths, resolveUnderProject, toPosix } from './knowledge-walk.ts';
import { normalizeUri, uriUnderEnabledRoots } from './knowledge-walk-ignore.ts';
export function normalizeEnqueueUri(projectPath: string, raw: string): string | undefined {
  const trimmed = raw.trim().normalize('NFC');
  if (!trimmed) {
    return undefined;
  }
  try {
    const abs = resolveUnderProject(projectPath, trimmed);
    const rel = normalizeUri(toPosix(relative(resolve(projectPath), abs))).normalize('NFC');
    return rel === '' ? undefined : rel;
  } catch {
    return undefined;
  }
}
export function filterEnqueueUris(
  projectPath: string,
  uris: string[],
  roots: string[] | null,
): string[] {
  const out: string[] = [];
  for (const raw of uris) {
    const uri = normalizeEnqueueUri(projectPath, raw);
    if (!uri) {
      continue;
    }
    if (roots && !uriUnderEnabledRoots(uri, roots)) {
      continue;
    }
    if (!out.includes(uri)) {
      out.push(uri);
    }
  }
  return out;
}
export async function indexOneUri(input: {
  repo: SqliteKnowledgeIndexRepo;
  sourceId: string;
  projectPath: string;
  uri: string;
  wantVector: boolean;
  embeddings: EmbeddingsPort | undefined;
  indexModeKey: string;
  signal?: AbortSignal;
}): Promise<void> {
  const absProject = resolve(input.projectPath);
  const abs = resolve(absProject, input.uri);
  if (abs !== absProject && !abs.startsWith(absProject + sep)) {
    trace('knowledge-indexer', 'skip path outside project', { uri: input.uri });
    return;
  }
  const exists = await access(abs).then(
    () => true,
    () => false,
  );
  if (!exists) {
    input.repo.deleteUriPrefix(input.sourceId, input.uri);
    return;
  }
  const entries = await collectKnowledgePaths(input.projectPath, input.uri);
  const updatedAt = new Date().toISOString();
  if (entries.length === 0) {
    input.repo.deleteUriPrefix(input.sourceId, input.uri);
    return;
  }
  for (const entry of entries) {
    if (input.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    upsertWalkEntry(input.repo, input.sourceId, entry, updatedAt);
    if (entry.kind === 'index') {
      await indexKnowledgeFile({
        repo: input.repo,
        sourceId: input.sourceId,
        entry,
        wantVector: input.wantVector,
        embeddings: input.embeddings,
        updatedAt,
        indexModeKey: input.indexModeKey,
        signal: input.signal,
      });
    }
  }
}
