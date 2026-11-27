import { describe, expect, test } from 'bun:test';
import type { SessionEvent } from 'harnesys';
import { threadFileRootsFromEvents } from './thread-files-changed.ts';

const THREAD_DIR = '/data/orgs/org-1/threads/th-1';

function toolEvent(partial: Record<string, unknown>): SessionEvent {
  return {
    type: 'tool',
    phase: 'completed',
    toolCallId: 'c-1',
    name: 'write_file',
    ...partial,
  } as SessionEvent;
}

describe('threadFileRootsFromEvents', () => {
  test('relative sandbox path on a completed write tool maps to the sandbox root', () => {
    const events = [toolEvent({ sideEffect: 'write', input: { path: 'sandbox/notes.md' } })];
    expect(threadFileRootsFromEvents(events, THREAD_DIR)).toEqual(['sandbox']);
  });

  test('batch inputs and move pairs union their roots, sorted and deduplicated', () => {
    const events = [
      toolEvent({
        name: 'write_file',
        sideEffect: 'write',
        input: { files: [{ path: 'sandbox/a.md' }, { path: 'sandbox/b.md' }] },
      }),
      toolEvent({
        name: 'move_file',
        sideEffect: 'write',
        input: { moves: [{ from: 'sandbox/a.md', to: 'tool-outputs/a.md' }] },
      }),
    ];
    expect(threadFileRootsFromEvents(events, THREAD_DIR)).toEqual(['sandbox', 'tool-outputs']);
  });

  test('a mutating tool without path fields marks the sandbox dirty', () => {
    const events = [toolEvent({ name: 'shell', sideEffect: 'write', input: { command: 'ls' } })];
    expect(threadFileRootsFromEvents(events, THREAD_DIR)).toEqual(['sandbox']);
  });

  test('root-level and legacy folder writes map to the writable root', () => {
    const events = [
      toolEvent({ sideEffect: 'write', input: { path: 'root-check.md' } }),
      toolEvent({ sideEffect: 'write', input: { path: 'notes/todo.md' } }),
    ];
    expect(threadFileRootsFromEvents(events, THREAD_DIR)).toEqual(['sandbox']);
  });

  test('paths outside the thread dir and dot segments produce no roots', () => {
    const events = [
      toolEvent({ sideEffect: 'write', input: { path: '/elsewhere/sandbox/notes.md' } }),
      toolEvent({ sideEffect: 'write', input: { path: '../outside/sandbox/notes.md' } }),
      toolEvent({ sideEffect: 'write', input: { path: '.runtime/raw-model-requests/x.json' } }),
      toolEvent({ sideEffect: 'write', input: { path: '.env' } }),
    ];
    expect(threadFileRootsFromEvents(events, THREAD_DIR)).toEqual([]);
  });

  test('absolute paths inside the thread dir map to their root', () => {
    const events = [
      toolEvent({ sideEffect: 'destructive', input: { paths: [`${THREAD_DIR}/sandbox/a.md`] } }),
    ];
    expect(threadFileRootsFromEvents(events, THREAD_DIR)).toEqual(['sandbox']);
  });

  test('a completed tool output with an attachment id marks attachments dirty', () => {
    const objectOutput = toolEvent({
      name: 'image_generate',
      sideEffect: 'write',
      output: { attachmentId: 'att-1', mediaType: 'image/png' },
    });
    const stringOutput = toolEvent({
      name: 'gmail_download_attachment',
      sideEffect: 'write',
      input: { path: 'src/x.ts' },
      output: JSON.stringify({ attachmentId: 'att-2', mediaType: 'text/csv' }),
    });
    expect(threadFileRootsFromEvents([objectOutput], THREAD_DIR)).toEqual([
      'attachments',
      'sandbox',
    ]);
    expect(threadFileRootsFromEvents([stringOutput], THREAD_DIR)).toEqual([
      'attachments',
      'sandbox',
    ]);
  });

  test('read-only, non-completed, and non-tool events produce no roots', () => {
    const events = [
      toolEvent({ sideEffect: 'read', input: { path: 'sandbox/notes.md' } }),
      toolEvent({ phase: 'requested', sideEffect: 'write', input: { path: 'sandbox/notes.md' } }),
      toolEvent({ phase: 'skipped', sideEffect: 'write', input: { path: 'sandbox/notes.md' } }),
      { type: 'user', text: 'hi', attachments: [] } as SessionEvent,
      { type: 'run.completed', seq: 1 } as SessionEvent,
    ];
    expect(threadFileRootsFromEvents(events, THREAD_DIR)).toEqual([]);
  });
});
