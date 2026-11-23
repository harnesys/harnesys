import hljs from 'highlight.js/lib/common';
import { memo } from 'react';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { PluggableList } from 'unified';
import 'katex/dist/katex.min.css';
import { lastBlockOffset } from '@/shared/lib/markdown-blocks';
import { cn } from '@/shared/lib/utils';
import { MarkdownMermaid } from '@/shared/ui/markdown-mermaid';

interface MarkdownProps {
  text: string;
  className?: string;
  streaming?: boolean;
  components?: Components;
}
const STREAM_REMARK: PluggableList = [remarkGfm];
const FULL_REMARK: PluggableList = [remarkGfm, remarkMath];
const STREAM_REHYPE: PluggableList = [];
const FULL_REHYPE: PluggableList = [rehypeKatex];

const MarkdownBlock = memo(function MarkdownBlock({
  text,
  remarkPlugins,
  rehypePlugins,
  components,
}: {
  text: string;
  remarkPlugins: PluggableList;
  rehypePlugins: PluggableList;
  components: Components;
}) {
  if (text === '') {
    return null;
  }
  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={components}
    >
      {text}
    </ReactMarkdown>
  );
});

export const Markdown = memo(function Markdown({
  text,
  className,
  streaming = false,
  components: extraComponents,
}: MarkdownProps) {
  const full = extraComponents ? { ...components, ...extraComponents } : components;
  const stream = extraComponents ? { ...STREAM_COMPONENTS, ...extraComponents } : STREAM_COMPONENTS;
  const boundary = streaming ? lastBlockOffset(text) : text.length;
  return (
    <div
      className={cn('markdown px-1.5 text-foreground leading-[1.45]', className)}
      data-streaming={streaming ? 'true' : undefined}
    >
      <MarkdownBlock
        text={text.slice(0, boundary)}
        remarkPlugins={FULL_REMARK}
        rehypePlugins={FULL_REHYPE}
        components={full}
      />
      <MarkdownBlock
        text={text.slice(boundary)}
        remarkPlugins={streaming ? STREAM_REMARK : FULL_REMARK}
        rehypePlugins={streaming ? STREAM_REHYPE : FULL_REHYPE}
        components={streaming ? stream : full}
      />
    </div>
  );
});
const components: Components = {
  code({ className, children }) {
    const text = String(children).replace(/\n$/, '');
    const lang = /language-([a-z0-9_+-]+)/i.exec(className ?? '')?.[1];
    if (lang === 'mermaid') {
      return <MarkdownMermaid chart={text} />;
    }
    if (lang === undefined && !text.includes('\n')) {
      return (
        <code className="rounded-sm bg-muted px-1 py-px text-[12px] text-foreground">{text}</code>
      );
    }
    return (
      <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 px-2.5 py-2">
        <code
          className="hljs font-mono text-[12px] leading-[1.45]"
          dangerouslySetInnerHTML={{ __html: highlightCode(text, lang) }}
        />
      </pre>
    );
  },
  pre({ children }) {
    return <>{children}</>;
  },
};
function streamCode({ className, children }: { className?: string; children?: React.ReactNode }) {
  const text = String(children).replace(/\n$/, '');
  if (!className && !text.includes('\n')) {
    return (
      <code className="rounded-sm bg-muted px-1 py-px text-[12px] text-foreground">{text}</code>
    );
  }
  return (
    <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 px-2.5 py-2">
      <code
        className="font-mono text-[12px] leading-[1.45]"
        dangerouslySetInnerHTML={{ __html: escapeHtml(text) }}
      />
    </pre>
  );
}
const STREAM_COMPONENTS: Components = { code: streamCode, pre: components.pre };
function highlightCode(text: string, lang: string | undefined): string {
  if (lang !== undefined && hljs.getLanguage(lang) !== undefined) {
    return hljs.highlight(text, { language: lang, ignoreIllegals: true }).value;
  }
  const detected = hljs.highlightAuto(text);
  if (detected.language !== undefined && detected.value.length > 0) {
    return detected.value;
  }
  return escapeHtml(text);
}
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
