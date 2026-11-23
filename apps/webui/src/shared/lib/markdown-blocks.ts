import type { Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

export function lastBlockOffset(text: string): number {
  if (text === '') {
    return 0;
  }
  const tree = parser.parse(text) as Root;
  const last = tree.children[tree.children.length - 1];
  return last?.position?.start.offset ?? 0;
}
