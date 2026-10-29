import { CHARS_PER_TOKEN_ESTIMATE } from '../constants.ts';
import type { RequestPlan, RequestSection, RequestSectionId } from '../ports/llm-plan.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { estimateMessageTokens } from './compaction/estimate.ts';
import type { LlmNote } from './llm-notes.ts';

export type { RequestPlan, RequestSection, RequestSectionId };

const estTokensOf = (chars: number): number => Math.ceil(chars / CHARS_PER_TOKEN_ESTIMATE);

function section(id: RequestSectionId, chars: number, children?: RequestSection[]): RequestSection {
  return children && children.length > 0
    ? { id, chars, estTokens: estTokensOf(chars), children }
    : { id, chars, estTokens: estTokensOf(chars) };
}

function pushSection(
  sections: RequestSection[],
  id: RequestSectionId,
  chars: number,
  children?: RequestSection[],
): void {
  if (chars > 0) {
    sections.push(section(id, chars, children));
  }
}

export interface SkillCatalogEntry {
  name: string;
  chars: number;
}

export interface RequestPlanInput {
  prompt: string;
  channelNote: string;
  skillsSection: string;
  runtimeSection: string;
  instructions: string;
  skillEntries?: readonly SkillCatalogEntry[];
  toolNames: readonly string[];
  toolRegistry: Map<string, ToolDefinition>;
  notes: readonly LlmNote[];
  requestMessages: readonly unknown[];
}

export function buildRequestPlan(input: RequestPlanInput): RequestPlan {
  const sections: RequestSection[] = [];
  const parts = [
    { id: 'system.prompt' as const, text: input.prompt },
    { id: 'system.channel' as const, text: input.channelNote },
    { id: 'system.skills' as const, text: input.skillsSection },
    { id: 'system.runtime' as const, text: input.runtimeSection },
  ].filter((part) => part.text.trim().length > 0);
  const separators = Math.max(0, parts.length - 1) * 2;
  parts.forEach((part, index) => {
    const isLast = index === parts.length - 1;
    const children =
      part.id === 'system.skills' ? skillChildren(input.skillEntries ?? []) : undefined;
    pushSection(sections, part.id, part.text.length + (isLast ? 0 : 2), children);
  });

  const toolSections = buildToolSections(input.toolNames, input.toolRegistry);
  const toolTextChars = toolSections.reduce((sum, s) => sum + s.chars, 0);
  const framing = Math.max(
    0,
    input.instructions.length -
      parts.reduce((sum, part) => sum + part.text.length, 0) -
      separators -
      toolTextChars,
  );
  if (framing > 0 && parts.length > 0 && sections.length > 0) {
    const last = sections[sections.length - 1];
    if (last) {
      last.chars += framing;
      last.estTokens = estTokensOf(last.chars);
    }
  }
  sections.push(...toolSections);

  const deferredChars = input.notes
    .filter((note) => note.tag === 'tools')
    .reduce((sum, note) => sum + note.text.length, 0);
  const plainNotes = input.notes.filter((note) => note.tag !== 'tools');
  const plainNotesChars = plainNotes.reduce((sum, note) => sum + note.text.length, 0);
  pushSection(sections, 'notes', plainNotesChars, noteChildren(plainNotes));
  pushSection(sections, 'tools.deferred', deferredChars);

  const historyTokens = input.requestMessages.reduce<number>(
    (sum, message) => sum + estimateMessageTokens(message),
    0,
  );
  if (input.requestMessages.length > 0) {
    sections.push({
      id: 'history',
      chars: historyTokens * CHARS_PER_TOKEN_ESTIMATE,
      estTokens: historyTokens,
    });
  }

  const totalChars = sections.reduce((sum, s) => sum + s.chars, 0);
  const totalEstTokens = sections.reduce((sum, s) => sum + s.estTokens, 0);
  return { sections, totalChars, totalEstTokens };
}

function skillChildren(entries: readonly SkillCatalogEntry[]): RequestSection[] {
  return entries
    .filter((entry) => entry.chars > 0)
    .map((entry) => section(`system.skills.${entry.name}`, entry.chars));
}

function noteChildren(notes: readonly LlmNote[]): RequestSection[] {
  const byTag = new Map<string, number>();
  for (const note of notes) {
    byTag.set(note.tag, (byTag.get(note.tag) ?? 0) + note.text.length + 1);
  }
  return [...byTag].map(([tag, chars]) => section(`notes.${tag}`, chars));
}

function toolWireChars(def: ToolDefinition): number {
  return JSON.stringify({
    type: 'function',
    function: { name: def.name, description: def.description, parameters: def.input },
  }).length;
}

function buildToolSections(
  names: readonly string[],
  registry: Map<string, ToolDefinition>,
): RequestSection[] {
  const sections: RequestSection[] = [];
  if (names.length === 0) {
    return sections;
  }
  const groups = new Map<string, string[]>();
  for (const name of names) {
    const group = registry.get(name)?.group ?? 'other';
    groups.set(group, [...(groups.get(group) ?? []), name]);
  }
  if (groups.size === 0) {
    return sections;
  }
  const headerChars = 'Capabilities available in this model call:'.length + 1;
  const footerChars =
    'Use only capabilities listed here or tools exposed by the deferred tool catalog.'.length + 1;
  pushSection(sections, 'tools', headerChars + footerChars);
  for (const [group, tools] of groups) {
    const line = `- ${group}: ${tools.join(', ')}`;
    const children = tools.map((name) => {
      const def = registry.get(name);
      return section(`tools.${group}.${name}`, def ? toolWireChars(def) : name.length + 2);
    });
    const schemaChars = children.reduce((sum, child) => sum + child.chars, 0);
    sections.push(section(`tools.${group}`, line.length + 1 + schemaChars, children));
  }
  return sections;
}
