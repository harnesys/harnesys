import type { ProjectMcpConfigServer } from '@harnesys/studio-shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldDescription, FieldError } from '@/shared/ui/field';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { Textarea } from '@/shared/ui/textarea';
import {
  emptyMcpFields,
  type McpFieldsInput,
  type McpFieldsOutput,
  type McpServerDraft,
  mcpFieldsFrom,
  mcpFieldsSchema,
  toMcpServerDraft,
} from '../model/mcp-fields';
import {
  mcpDraftToJson,
  mcpFieldsInputToJson,
  mcpJsonToFields,
  parseMcpJsonDraft,
} from '../model/mcp-json';
import { McpFields } from './mcp-fields';

type DialogMode = 'form' | 'json';

export function AddMcpServerDialog({ onResolve }: DialogComponentProps<McpServerDraft>) {
  return (
    <McpServerDialogForm
      defaultValues={emptyMcpFields()}
      submitLabel="Add server"
      onResolve={onResolve}
    />
  );
}

export function EditMcpServerDialog({
  onResolve,
  data,
}: DialogComponentProps<
  McpServerDraft,
  {
    server: ProjectMcpConfigServer;
  }
>) {
  return (
    <McpServerDialogForm
      defaultValues={data?.server ? mcpFieldsFrom(data.server) : emptyMcpFields()}
      serverIdLocked
      lockedServerId={data?.server.serverId}
      submitLabel="Save"
      onResolve={onResolve}
    />
  );
}

function McpServerDialogForm({
  defaultValues,
  serverIdLocked = false,
  lockedServerId,
  submitLabel,
  onResolve,
}: {
  defaultValues: McpFieldsInput;
  serverIdLocked?: boolean;
  lockedServerId?: string;
  submitLabel: string;
  onResolve?: (draft?: McpServerDraft) => void;
}) {
  const form = useForm<McpFieldsInput, unknown, McpFieldsOutput>({
    resolver: zodResolver(mcpFieldsSchema),
    defaultValues,
  });
  const [mode, setMode] = useState<DialogMode>('form');
  const [jsonText, setJsonText] = useState('');
  const [jsonPristine, setJsonPristine] = useState(true);
  const [jsonError, setJsonError] = useState<string | null>(null);

  function requestMode(next: DialogMode) {
    if (next === mode) {
      return;
    }
    if (next === 'json') {
      setJsonText(mcpFieldsInputToJson(form.getValues()));
      setJsonPristine(true);
      setJsonError(null);
      setMode('json');
      return;
    }
    if (jsonPristine) {
      setMode('form');
      return;
    }
    const parsed = parseMcpJsonDraft(jsonText, lockedServerId);
    if (!parsed.ok) {
      setJsonError(parsed.error);
      return;
    }
    form.reset(mcpJsonToFields(parsed.json));
    setJsonError(null);
    setMode('form');
  }

  function submitJson() {
    const parsed = parseMcpJsonDraft(jsonText, lockedServerId);
    if (!parsed.ok) {
      setJsonError(parsed.error);
      return;
    }
    onResolve?.(parsed.draft);
  }

  return (
    <form
      className="flex min-h-0 flex-col gap-4"
      onSubmit={
        mode === 'form'
          ? form.handleSubmit((values) => onResolve?.(toMcpServerDraft(values)))
          : (event) => {
              event.preventDefault();
              submitJson();
            }
      }
    >
      <Tabs value={mode} onValueChange={(value) => requestMode(value as DialogMode)}>
        <TabsList className="w-full">
          <TabsTrigger value="form" className="flex-1">
            Form
          </TabsTrigger>
          <TabsTrigger value="json" className="flex-1">
            JSON
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {mode === 'form' ? (
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          <McpFields control={form.control} serverIdLocked={serverIdLocked} />
        </div>
      ) : (
        <Field data-invalid={jsonError !== null || undefined}>
          <Textarea
            value={jsonText}
            onChange={(event) => {
              setJsonText(event.target.value);
              setJsonPristine(false);
              setJsonError(null);
            }}
            className="min-h-64 resize-y font-mono text-xs leading-relaxed"
            placeholder={mcpDraftToJson({
              serverId: lockedServerId ?? 'filesystem',
              body: { enabled: true, transport: 'stdio', command: 'npx' },
            })}
            spellCheck={false}
            aria-label="Server JSON"
          />
          <FieldDescription>
            Single server or {'{"mcpServers": {...}}'} with one server.
          </FieldDescription>
          {jsonError ? <FieldError>{jsonError}</FieldError> : null}
        </Field>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button type="submit">{submitLabel}</Button>
      </DialogFooter>
    </form>
  );
}
