import type { MessageQuote } from '@harnesys/contracts';

export function quoteBlockText(quote: Pick<MessageQuote, 'author' | 'text'>): string {
  const quoted = quote.text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  return `> ${quote.author}:\n${quoted}\n\n`;
}
