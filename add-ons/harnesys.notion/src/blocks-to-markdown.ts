import type { Block } from './notion-api.ts';

interface RichText {
  type?: string;
  text?: { content?: string };
  plain_text?: string;
}

interface BlockPayload {
  rich_text?: RichText[];
}

function richTextToMarkdown(items: unknown): string {
  if (!Array.isArray(items)) {
    return '';
  }
  let out = '';
  for (const item of items) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const rich = item as RichText;
    out += rich.text?.content ?? (typeof rich.plain_text === 'string' ? rich.plain_text : '');
  }
  return out;
}

function blockLine(type: string, payload: BlockPayload | undefined, text: string): string {
  switch (type) {
    case 'paragraph':
      return text;
    case 'heading_1':
      return `# ${text}`;
    case 'heading_2':
      return `## ${text}`;
    case 'heading_3':
      return `### ${text}`;
    case 'bulleted_list_item':
    case 'toggle':
      return `- ${text}`;
    case 'numbered_list_item':
      return `1. ${text}`;
    case 'to_do': {
      const todo = payload as { checked?: boolean } | undefined;
      return `- [${todo?.checked === true ? 'x' : ' '}] ${text}`;
    }
    case 'quote':
      return `> ${text}`;
    case 'code': {
      const code = payload as { language?: string } | undefined;
      return `\`\`\`${code?.language ?? ''}\n${text}\n\`\`\``;
    }
    case 'divider':
      return '---';
    case 'callout': {
      const callout = payload as { icon?: { emoji?: string } } | undefined;
      const emoji = callout?.icon?.emoji ?? '';
      return `> ${emoji === '' ? '' : `${emoji} `}${text}`;
    }
    case 'unsupported':
    case 'child_page':
    case 'child_database':
      return `*(${type})*`;
    default:
      return text === '' ? `*(${type})*` : text;
  }
}

export function blocksToMarkdown(blocks: readonly Block[]): string {
  const out: string[] = [];
  for (const block of blocks) {
    const payload = block[block.type] as BlockPayload | undefined;
    out.push(blockLine(block.type, payload, richTextToMarkdown(payload?.rich_text)));
  }
  return out.join('\n\n');
}
