import { type WidgetDoc, WidgetDocSchema } from '@harnesys/contracts';
import { Editor } from '@monaco-editor/react';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { useTheme } from '@/shared/ui/theme-provider';
import { editorThemeName } from '@/widgets/file-pane/model/editor-setup';
import { defineAppThemes } from '@/widgets/file-pane/ui/monaco-themes';

interface WidgetJsonEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing doc to edit; defaults to a starter template. */
  initial?: WidgetDoc;
  onSave: (doc: WidgetDoc) => void;
}

function formatIssuePath(path: PropertyKey[]): string {
  return path.length > 0 ? path.map(String).join('.') : '(root)';
}

function validate(raw: string): { doc?: WidgetDoc; errors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { errors: [`Invalid JSON: ${error instanceof Error ? error.message : 'parse failed'}`] };
  }
  const result = WidgetDocSchema.safeParse(parsed);
  if (result.success) {
    return { doc: result.data, errors: [] };
  }
  return {
    errors: result.error.issues.map(
      (issue) => `${formatIssuePath([...issue.path])}: ${issue.message}`,
    ),
  };
}

function defaultDocJson(): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      title: 'Untitled widget',
      sources: [],
      state: {},
      derived: {},
      items: [
        {
          id: 'item-1',
          primitive: 'metric',
          rect: { x: 0, y: 0, w: 192, h: 96 },
          props: { label: 'Value', format: 'number' },
          bindings: {},
          on: {},
        },
      ],
      primitive: 'custom',
      config: {},
    },
    null,
    2,
  );
}

function docJson(doc: WidgetDoc): string {
  return JSON.stringify(doc, null, 2);
}

function seedKey(initial?: WidgetDoc): string {
  return initial ? JSON.stringify(initial) : '';
}

export function WidgetJsonEditorDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: WidgetJsonEditorDialogProps) {
  const { theme } = useTheme();
  const [raw, setRaw] = useState<string>(() => (initial ? docJson(initial) : defaultDocJson()));
  // Re-seed the editor whenever the dialog is (re)opened with a different doc.
  const seed = open ? seedKey(initial) : null;
  const [seeded, setSeeded] = useState<string | null>(seed);
  if (seed !== null && seed !== seeded) {
    setSeeded(seed);
    setRaw(initial ? docJson(initial) : defaultDocJson());
  }
  const validation = open ? validate(raw) : { errors: [] as string[] };
  const canSave = validation.doc !== undefined;

  const save = () => {
    if (!validation.doc) {
      return;
    }
    onSave(validation.doc);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] flex-col gap-3 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Custom widget JSON</DialogTitle>
          <DialogDescription>
            Edit the full widget document. It is validated against the widget doc schema before
            saving.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border">
          <Editor
            height="100%"
            value={raw}
            language="json"
            theme={editorThemeName(theme)}
            options={{
              minimap: { enabled: false },
              formatOnPaste: true,
              formatOnType: true,
              tabSize: 2,
            }}
            loading={<span className="p-3 text-muted-foreground text-xs">Loading editor…</span>}
            beforeMount={defineAppThemes}
            onChange={(value) => setRaw(value ?? '')}
          />
        </div>
        {validation.errors.length > 0 ? (
          <div className="flex max-h-28 flex-col gap-0.5 overflow-y-auto rounded-md bg-destructive/10 px-3 py-2 text-destructive text-xs">
            {validation.errors.map((error) => (
              <span key={error}>{error}</span>
            ))}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!canSave} data-testid="widget-json-save">
            Add widget
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
