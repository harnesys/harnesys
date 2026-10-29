export interface NormalizeReport {
  droppedOrphanIds?: string[];
  droppedDuplicateIds?: string[];
  insertedCallIds?: string[];
  heldUserMessages?: number;
}

type ReportListKey = 'droppedOrphanIds' | 'droppedDuplicateIds' | 'insertedCallIds';

interface ContentPart {
  type?: string;
  toolCallId?: unknown;
  toolName?: unknown;
}

interface MessageRecord {
  role?: string;
  content?: unknown;
}

interface DeclaredCall {
  id: string;
  name: string;
}

interface OpenBlock {
  calls: DeclaredCall[];
  answered: Set<string>;
  insertAt: number;
}

interface PartVerdict {
  kept: unknown[];
  orphans: string[];
  supersedes: string[];
}

const UNANSWERED_RESULT_TEXT =
  'call was interrupted before the result reached the model; re-issue if needed';

function reportId(report: NormalizeReport, key: ReportListKey, id: string): void {
  const list = report[key];
  if (list) {
    list.push(id);
    return;
  }
  report[key] = [id];
}

function toolResultIds(content: unknown): string[] {
  if (!Array.isArray(content)) {
    return [];
  }
  const ids: string[] = [];
  for (const part of content as ContentPart[]) {
    if (part?.type === 'tool-result' && typeof part.toolCallId === 'string' && part.toolCallId) {
      ids.push(part.toolCallId);
    }
  }
  return ids;
}

function declaredCalls(message: MessageRecord): DeclaredCall[] {
  if (!Array.isArray(message.content)) {
    return [];
  }
  const calls: DeclaredCall[] = [];
  for (const part of message.content as ContentPart[]) {
    if (part?.type === 'tool-call' && typeof part.toolCallId === 'string' && part.toolCallId) {
      calls.push({ id: part.toolCallId, name: String(part.toolName ?? 'tool') });
    }
  }
  return calls;
}

function verdictFor(message: MessageRecord, block: OpenBlock | null): PartVerdict {
  const verdict: PartVerdict = { kept: [], orphans: [], supersedes: [] };
  if (!Array.isArray(message.content)) {
    return verdict;
  }
  for (const part of message.content as ContentPart[]) {
    if (part?.type !== 'tool-result' || typeof part.toolCallId !== 'string' || !part.toolCallId) {
      verdict.kept.push(part);
      continue;
    }
    const declared = block?.calls.some((call) => call.id === part.toolCallId) ?? false;
    if (!block || !declared) {
      verdict.orphans.push(part.toolCallId);
      continue;
    }
    if (block.answered.has(part.toolCallId)) {
      verdict.supersedes.push(part.toolCallId);
    }
    verdict.kept.push(part);
  }
  return verdict;
}

function syntheticResult(id: string, name: string): MessageRecord {
  return {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: id,
        toolName: name,
        output: { type: 'text', value: UNANSWERED_RESULT_TEXT },
      },
    ],
  };
}

function flushBlock(out: MessageRecord[], block: OpenBlock, report: NormalizeReport): void {
  const missing = block.calls.filter((call) => !block.answered.has(call.id));
  let at = block.insertAt;
  for (const call of missing) {
    out.splice(at, 0, syntheticResult(call.id, call.name));
    reportId(report, 'insertedCallIds', call.id);
    at += 1;
  }
}

function dropSuperseded(out: MessageRecord[], id: string): void {
  for (let i = out.length - 1; i >= 0; i--) {
    const message = out[i];
    if (message?.role === 'assistant') {
      return;
    }
    if (message?.role === 'tool' && toolResultIds(message.content).includes(id)) {
      out.splice(i, 1);
      return;
    }
  }
}

function applyToolMessage(
  out: MessageRecord[],
  block: OpenBlock | null,
  message: MessageRecord,
  report: NormalizeReport,
): void {
  const verdict = verdictFor(message, block);
  for (const id of verdict.orphans) {
    reportId(report, 'droppedOrphanIds', id);
  }
  for (const id of verdict.supersedes) {
    dropSuperseded(out, id);
    reportId(report, 'droppedDuplicateIds', id);
  }
  if (verdict.kept.length === 0) {
    return;
  }
  out.push({ ...message, content: verdict.kept });
  if (!block) {
    return;
  }
  for (const part of verdict.kept as ContentPart[]) {
    if (typeof part?.toolCallId === 'string') {
      block.answered.add(part.toolCallId);
    }
  }
  block.insertAt = out.length;
}

function applyToolResult(
  out: MessageRecord[],
  block: OpenBlock | null,
  message: MessageRecord,
  report: NormalizeReport,
): void {
  applyToolMessage(out, block, message, report);
  if (block && block.insertAt !== out.length) {
    block.insertAt = out.length;
  }
}

function openAssistantBlock(out: MessageRecord[], message: MessageRecord): OpenBlock | null {
  const calls = declaredCalls(message);
  out.push(message);
  return calls.length > 0 ? { calls, answered: new Set(), insertAt: out.length } : null;
}

export function normalizeToolSequence(messages: MessageRecord[]): {
  messages: MessageRecord[];
  report: NormalizeReport;
} {
  const out: MessageRecord[] = [];
  const report: NormalizeReport = {};
  let block: OpenBlock | null = null;
  let held: MessageRecord[] = [];
  const releaseHeld = (): void => {
    if (held.length > 0) {
      out.push(...held);
      held = [];
    }
  };
  const holdsBlock = (): boolean => {
    const open = block;
    if (!open) {
      return false;
    }
    return held.length > 0 || open.calls.some((call) => !open.answered.has(call.id));
  };
  for (const message of messages) {
    const role = message?.role;
    if (role === 'tool') {
      applyToolResult(out, block, message, report);
      continue;
    }
    if (role === 'assistant') {
      if (block) {
        flushBlock(out, block, report);
        block = null;
      }
      releaseHeld();
      block = openAssistantBlock(out, message);
      continue;
    }
    if ((role === 'user' || role === 'system') && holdsBlock()) {
      held.push(message);
      report.heldUserMessages = (report.heldUserMessages ?? 0) + 1;
      continue;
    }
    out.push(message);
  }
  if (block) {
    flushBlock(out, block, report);
  }
  releaseHeld();
  return { messages: out, report };
}
