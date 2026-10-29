import './issue-description-editor.css';
import type { Editor } from '@tiptap/core';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import Typography from '@tiptap/extension-typography';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link as LinkIcon,
  Strikethrough,
  Underline as UnderlineIcon,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { htmlToMarkdown, markdownToHtml } from './issue-markdown-codec';

const lowlight = createLowlight(common);

interface IssueDescriptionEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  readOnly?: boolean;
}

export function IssueDescriptionEditor({
  value,
  onChange,
  onBlur,
  placeholder = 'Start writing a description...',
  readOnly = false,
}: IssueDescriptionEditorProps) {
  const latest = useRef({ onChange, onBlur });
  latest.current = { onChange, onBlur };
  const [isFocused, setIsFocused] = useState(false);
  const focusedRef = useRef(false);
  useEffect(() => {
    focusedRef.current = isFocused;
  }, [isFocused]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, link: false }),
      Placeholder.configure({ placeholder }),
      Underline,
      Highlight.configure({ multicolor: false }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      TaskList.configure({ HTMLAttributes: { class: 'tiptap-task-list' } }),
      TaskItem.configure({ nested: true }),
      Typography,
      CodeBlockLowlight.configure({ lowlight, defaultLanguage: 'plaintext' }),
    ],
    content: markdownToHtml(value),
    editable: !readOnly,
    onUpdate: ({ editor: current }) => {
      if (current.isFocused) {
        latest.current.onChange(htmlToMarkdown(current.getHTML()));
      }
    },
    onFocus: () => {
      focusedRef.current = true;
      setIsFocused(true);
    },
    onBlur: () => {
      focusedRef.current = false;
      setIsFocused(false);
      latest.current.onBlur?.();
    },
    editorProps: { attributes: { class: 'tiptap-editor-content', spellcheck: 'true' } },
  });

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || focusedRef.current) {
      return;
    }
    const nextHtml = markdownToHtml(value);
    if (editor.getHTML() !== nextHtml) {
      editor.commands.setContent(nextHtml, { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) {
    return null;
  }
  return (
    <div data-testid="issue-drawer-description">
      <BubbleMenu
        editor={editor}
        shouldShow={({ editor: current, from, to }) => from !== to && !current.isActive('image')}
      >
        <BubbleToolbar editor={editor} />
      </BubbleMenu>
      <EditorContent editor={editor} className="tiptap-content-area" />
    </div>
  );
}

function BubbleToolbar({ editor }: { editor: Editor }) {
  const [linkMode, setLinkMode] = useState(false);
  if (linkMode) {
    return (
      <div className="flex items-center gap-0.5 rounded-lg border border-border bg-popover px-1.5 py-1 shadow-xl">
        <LinkDialog editor={editor} onClose={() => setLinkMode(false)} />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-popover px-1.5 py-1 shadow-xl">
      <ToolbarButton
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold"
      >
        <Bold className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic"
      >
        <Italic className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="Underline"
      >
        <UnderlineIcon className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="Strikethrough"
      >
        <Strikethrough className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('highlight')}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        title="Highlight"
      >
        <Highlighter className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('code')}
        onClick={() => editor.chain().focus().toggleCode().run()}
        title="Inline code"
      >
        <Code className="size-3.5" />
      </ToolbarButton>
      <div className="mx-0.5 h-4 w-px shrink-0 bg-border" />
      <ToolbarButton
        active={editor.isActive('link')}
        onClick={() => setLinkMode(true)}
        title="Link"
      >
        <LinkIcon className="size-3.5" />
      </ToolbarButton>
      <div className="mx-0.5 h-4 w-px shrink-0 bg-border" />
      <ToolbarButton
        active={editor.isActive('heading', { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        title="Heading 1"
      >
        <Heading1 className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Heading 2"
      >
        <Heading2 className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="Heading 3"
      >
        <Heading3 className="size-3.5" />
      </ToolbarButton>
    </div>
  );
}

function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [href, setHref] = useState(() => String(editor.getAttributes('link').href ?? ''));
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const apply = (): void => {
    if (href.trim() !== '') {
      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .setLink({ href: href.trim(), target: '_blank' })
        .run();
    } else {
      editor.chain().focus().unsetLink().run();
    }
    onClose();
  };
  return (
    <div className="flex items-center gap-1 px-1">
      <input
        ref={inputRef}
        value={href}
        onChange={(event) => setHref(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            apply();
          }
          if (event.key === 'Escape') {
            onClose();
          }
        }}
        placeholder="https://..."
        className="h-6 w-40 rounded border border-border bg-muted px-2 text-xs outline-none placeholder:text-muted-foreground/40 focus:border-ring"
      />
      <button
        type="button"
        onClick={apply}
        className="h-6 rounded bg-primary px-2 text-primary-foreground text-xs transition-colors hover:bg-primary/90"
      >
        OK
      </button>
      <button
        type="button"
        onClick={onClose}
        className="flex items-center text-muted-foreground hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded transition-all',
        'text-muted-foreground hover:bg-accent hover:text-foreground',
        active && 'bg-accent text-foreground',
      )}
    >
      {children}
    </button>
  );
}
