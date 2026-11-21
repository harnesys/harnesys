import { Editor } from '@monaco-editor/react';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { MonacoBoundary } from '@/shared/ui/monaco-boundary';
import { useTheme } from '@/shared/ui/theme-provider';
import { editorThemeName } from '@/widgets/file-pane/model/editor-setup';
import { defineAppThemes } from '@/widgets/file-pane/ui/monaco-themes';
import { Section } from './section';

export function TransformEditor({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (next: string | undefined) => void;
}): ReactNode {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <Section
      label="Transform (legacy)"
      action={
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Toggle transform editor"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </Button>
      }
    >
      {open ? (
        <div className="h-44 overflow-hidden rounded-lg border">
          <MonacoBoundary
            fallback={
              <span className="p-2 text-[11px] text-muted-foreground">Loading editor...</span>
            }
          >
            <Editor
              height="100%"
              value={value ?? ''}
              language="javascript"
              theme={editorThemeName(theme)}
              options={{
                minimap: { enabled: false },
                fontSize: 11,
                lineNumbers: 'off',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                tabSize: 2,
              }}
              beforeMount={defineAppThemes}
              onChange={(next) => onChange(next ? next : undefined)}
              loading={
                <span className="p-2 text-[11px] text-muted-foreground">Loading editor...</span>
              }
            />
          </MonacoBoundary>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Worker sandbox script for single-primitive widgets.
        </p>
      )}
    </Section>
  );
}
