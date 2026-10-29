interface BlockParse {
  html: string;
  next: number;
}

export function markdownToHtml(md: string): string {
  if (md.trim() === '') {
    return '';
  }
  const lines = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').split('\n');
  const result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const parsed =
      parseFence(lines, i) ??
      parseHeading(lines, i) ??
      parseQuote(lines, i) ??
      parseRule(lines, i) ??
      parseTaskList(lines, i) ??
      parseBulletList(lines, i) ??
      parseOrderedList(lines, i) ??
      parseParagraph(lines, i);
    if (!parsed) {
      i += 1;
      continue;
    }
    result.push(parsed.html);
    i = parsed.next;
  }
  return result.join('');
}

function parseFence(lines: string[], start: number): BlockParse | null {
  const line = lines[start] ?? '';
  const fence = line.match(/^(`{3,}|~{3,})([\w-]*)/);
  if (!fence) {
    return null;
  }
  const mark = fence[1] ?? '';
  const lang = fence[2] ?? '';
  const codeLines: string[] = [];
  let i = start + 1;
  while (i < lines.length) {
    const current = lines[i] ?? '';
    if (mark !== '' && current.startsWith(mark)) {
      i += 1;
      break;
    }
    codeLines.push(current);
    i += 1;
  }
  return {
    html: `<pre><code class="language-${lang}">${codeLines.join('\n')}</code></pre>`,
    next: i,
  };
}

function parseHeading(lines: string[], start: number): BlockParse | null {
  const line = lines[start] ?? '';
  const h3 = line.match(/^### (.+)/);
  if (h3) {
    return { html: `<h3>${inlineMarkdown(h3[1] ?? '')}</h3>`, next: start + 1 };
  }
  const h2 = line.match(/^## (.+)/);
  if (h2) {
    return { html: `<h2>${inlineMarkdown(h2[1] ?? '')}</h2>`, next: start + 1 };
  }
  const h1 = line.match(/^# (.+)/);
  if (h1) {
    return { html: `<h1>${inlineMarkdown(h1[1] ?? '')}</h1>`, next: start + 1 };
  }
  return null;
}

function parseQuote(lines: string[], start: number): BlockParse | null {
  const line = lines[start] ?? '';
  if (!line.startsWith('&gt;')) {
    return null;
  }
  const quoteLines: string[] = [line.slice(4).trim()];
  let i = start + 1;
  while (i < lines.length) {
    const current = lines[i] ?? '';
    if (!current.startsWith('&gt;')) {
      break;
    }
    quoteLines.push(current.slice(4).trim());
    i += 1;
  }
  return {
    html: `<blockquote><p>${quoteLines.map(inlineMarkdown).join('</p><p>')}</p></blockquote>`,
    next: i,
  };
}

function parseRule(lines: string[], start: number): BlockParse | null {
  const line = lines[start] ?? '';
  if (/^[-*_]{3,}$/.test(line.trim())) {
    return { html: '<hr>', next: start + 1 };
  }
  return null;
}

function parseTaskList(lines: string[], start: number): BlockParse | null {
  const line = lines[start] ?? '';
  if (!/^- \[[ xX]\] /.test(line)) {
    return null;
  }
  const items: string[] = [];
  let i = start;
  while (i < lines.length) {
    const current = lines[i] ?? '';
    if (!/^- \[[ xX]\] /.test(current)) {
      break;
    }
    const checked = /^- \[[xX]\] /.test(current);
    const text = current.replace(/^- \[[ xX]\] /, '');
    items.push(
      `<li data-checked="${checked}" data-type="taskItem"><label><input type="checkbox"${checked ? ' checked' : ''}></label><div>${inlineMarkdown(text)}</div></li>`,
    );
    i += 1;
  }
  return { html: `<ul data-type="taskList">${items.join('')}</ul>`, next: i };
}

function parseBulletList(lines: string[], start: number): BlockParse | null {
  const line = lines[start] ?? '';
  if (!/^[-*+] /.test(line)) {
    return null;
  }
  const items: string[] = [];
  let i = start;
  while (i < lines.length) {
    const current = lines[i] ?? '';
    if (!/^[-*+] /.test(current)) {
      break;
    }
    items.push(`<li><p>${inlineMarkdown(current.slice(2))}</p></li>`);
    i += 1;
  }
  return { html: `<ul>${items.join('')}</ul>`, next: i };
}

function parseOrderedList(lines: string[], start: number): BlockParse | null {
  const line = lines[start] ?? '';
  if (!/^\d+\. /.test(line)) {
    return null;
  }
  const items: string[] = [];
  let i = start;
  while (i < lines.length) {
    const current = lines[i] ?? '';
    if (!/^\d+\. /.test(current)) {
      break;
    }
    items.push(`<li><p>${inlineMarkdown(current.replace(/^\d+\. /, ''))}</p></li>`);
    i += 1;
  }
  return { html: `<ol>${items.join('')}</ol>`, next: i };
}

function parseParagraph(lines: string[], start: number): BlockParse | null {
  const line = lines[start] ?? '';
  if (line.trim() === '') {
    return null;
  }
  const paraLines: string[] = [line];
  let i = start + 1;
  while (i < lines.length) {
    const current = lines[i] ?? '';
    if (current.trim() === '' || /^(#|>|```|~~~|[-*+] |\d+\. |[-*_]{3,})/.test(current)) {
      break;
    }
    paraLines.push(current);
    i += 1;
  }
  return { html: `<p>${paraLines.map(inlineMarkdown).join('<br>')}</p>`, next: i };
}

function inlineMarkdown(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>');
}

export function htmlToMarkdown(html: string): string {
  if (html === '' || html === '<p></p>') {
    return '';
  }
  const div = document.createElement('div');
  div.innerHTML = html;
  return nodeToMarkdown(div).trim();
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? '';
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const children = Array.from(el.childNodes).map(nodeToMarkdown).join('');
  switch (tag) {
    case 'div':
      return children;
    case 'p':
      return children !== '' ? `${children}\n\n` : '';
    case 'br':
      return '\n';
    case 'strong':
    case 'b':
      return `**${children}**`;
    case 'em':
    case 'i':
      return `*${children}*`;
    case 'u':
      return `__${children}__`;
    case 's':
    case 'del':
    case 'strike':
      return `~~${children}~~`;
    case 'code': {
      if (el.parentElement?.tagName.toLowerCase() === 'pre') {
        return children;
      }
      return `\`${children}\``;
    }
    case 'pre': {
      const code = el.querySelector('code');
      const lang = code?.className.replace('language-', '') ?? '';
      const content = code?.textContent ?? children;
      return `\`\`\`${lang}\n${content}\n\`\`\`\n\n`;
    }
    case 'h1':
      return `# ${children}\n\n`;
    case 'h2':
      return `## ${children}\n\n`;
    case 'h3':
      return `### ${children}\n\n`;
    case 'h4':
      return `#### ${children}\n\n`;
    case 'h5':
      return `##### ${children}\n\n`;
    case 'h6':
      return `###### ${children}\n\n`;
    case 'blockquote':
      return `${children
        .split('\n')
        .map((entry) => (entry !== '' ? `> ${entry}` : '>'))
        .join('\n')}\n\n`;
    case 'hr':
      return '---\n\n';
    case 'a': {
      const href = el.getAttribute('href') ?? '';
      return `[${children}](${href})`;
    }
    case 'mark':
      return `==${children}==`;
    case 'ul': {
      if (
        el.getAttribute('data-type') === 'taskList' ||
        el.classList.contains('tiptap-task-list')
      ) {
        return `${Array.from(el.children)
          .map((item) => {
            const checked = (item as HTMLElement).getAttribute('data-checked') === 'true';
            const text = nodeToMarkdown(item).trim();
            return `- [${checked ? 'x' : ' '}] ${text}\n`;
          })
          .join('')}\n`;
      }
      return `${Array.from(el.children)
        .map((item) => `- ${nodeToMarkdown(item).trim()}\n`)
        .join('')}\n`;
    }
    case 'ol': {
      return `${Array.from(el.children)
        .map((item, index) => `${index + 1}. ${nodeToMarkdown(item).trim()}\n`)
        .join('')}\n`;
    }
    case 'li': {
      const div = el.querySelector('div');
      if (div) {
        return nodeToMarkdown(div);
      }
      return children;
    }
    default:
      return children;
  }
}
