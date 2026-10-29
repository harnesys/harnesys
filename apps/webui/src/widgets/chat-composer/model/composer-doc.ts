import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { inlineEntityKind, inlineEntityText, isInlineEntityNode } from './inline-entity-node';
export interface ComposerPayload {
  text: string;
  skills: string[];
}
function appendInlineEntity(child: ProseMirrorNode, text: string, skills: string[]): string {
  const kind = inlineEntityKind(child);
  const ref = child.attrs.ref as string;
  if (kind === 'skill') {
    if (!skills.includes(ref)) {
      skills.push(ref);
    }
    return text;
  }
  if (kind === 'file') {
    const href = child.attrs.href as string;
    const gap = text.length > 0 && !text.endsWith(' ') ? ' ' : '';
    return `${text}${gap}${inlineEntityText(kind, ref, href)} `;
  }
  return text;
}
function appendInlineChild(child: ProseMirrorNode, text: string, skills: string[]): string {
  if (child.isText) {
    return text + (child.text ?? '');
  }
  if (child.type.name === 'hardBreak') {
    return `${text}\n`;
  }
  if (isInlineEntityNode(child)) {
    return appendInlineEntity(child, text, skills);
  }
  return text;
}
export function serializeComposerDoc(doc: ProseMirrorNode): ComposerPayload {
  const skills: string[] = [];
  const blocks: string[] = [];
  doc.forEach((block) => {
    let text = '';
    block.forEach((child) => {
      text = appendInlineChild(child, text, skills);
    });
    blocks.push(text);
  });
  const text = blocks.join('\n').replace(/ {2,}/g, ' ').trim();
  return { text, skills };
}
