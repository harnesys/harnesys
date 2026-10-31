import type { PackConfig } from '@harnesys/studio-shared';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { Textarea } from '@/shared/ui/textarea';
import { ImagePackSettings } from './image-pack-settings';
import { MemoryPackSettings } from './memory-pack-settings';
import { WebPackSettings } from './web-pack-settings';
export const PACKS_WITH_SETTINGS = new Set(['agents', 'files', 'shell', 'web']);
const DEFAULT_SHELL_TIMEOUT_MS = 30000;
const DEFAULT_FILES_BLOCKLIST = [
  '.env',
  '.env.*',
  '**/.ssh/**',
  '**/.gnupg/**',
  '**/.aws/**',
  '**/id_rsa',
  '**/id_ed25519',
  '**/*.pem',
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  'dist',
];
export function packHasSettings(name: string, catalogHasSettings: boolean): boolean {
  return catalogHasSettings || PACKS_WITH_SETTINGS.has(name);
}
export function PackSettingsFields({
  packName,
  config,
  onChange,
}: {
  packName: string;
  config: PackConfig;
  onChange: (next: PackConfig) => void;
}) {
  if (packName === 'files') {
    return <FilesSettings config={config} onChange={onChange} />;
  }
  if (packName === 'agents') {
    return <AgentsSettings config={config} onChange={onChange} />;
  }
  if (packName === 'shell') {
    return <ShellSettings config={config} onChange={onChange} />;
  }
  if (packName === 'web') {
    return <WebPackSettings config={config} onChange={onChange} />;
  }
  if (packName === 'image') {
    return <ImagePackSettings config={config} onChange={onChange} />;
  }
  if (packName.endsWith('-memory')) {
    return <MemoryPackSettings packName={packName} config={config} onChange={onChange} />;
  }
  return (
    <p className="text-[11px] text-muted-foreground leading-snug">
      No Studio form for this pack yet.
    </p>
  );
}
function AgentsSettings({
  config,
  onChange,
}: {
  config: PackConfig;
  onChange: (next: PackConfig) => void;
}) {
  const spec = config.spec ?? {};
  const ownDelegatesOnly = spec.ownDelegatesOnly === true;
  function patchSpec(partial: Record<string, unknown>) {
    const nextSpec = { ...spec, ...partial };
    if (nextSpec.ownDelegatesOnly !== true) {
      delete nextSpec.ownDelegatesOnly;
    }
    onChange({ spec: nextSpec });
  }
  return (
    <FieldGroup className="gap-2">
      <Field>
        <div className="flex items-center gap-2">
          <Switch
            id="pack-agents-own-delegates"
            size="sm"
            checked={ownDelegatesOnly}
            onCheckedChange={(next) => patchSpec({ ownDelegatesOnly: next === true })}
            aria-label="Own delegates only"
          />
          <FieldLabel htmlFor="pack-agents-own-delegates">Own delegates only</FieldLabel>
        </div>
        <FieldDescription className="text-[11px] leading-snug">
          Limits `agents_update` to delegates created by this agent; `agents_delete` is always
          limited to own delegates. Off lets the agent patch any agent in the org.
        </FieldDescription>
      </Field>
    </FieldGroup>
  );
}
function FilesSettings({
  config,
  onChange,
}: {
  config: PackConfig;
  onChange: (next: PackConfig) => void;
}) {
  const spec = config.spec ?? {};
  const root = typeof spec.root === 'string' ? spec.root : '';
  const blocklist = Array.isArray(spec.blocklist)
    ? spec.blocklist.filter((item): item is string => typeof item === 'string')
    : undefined;
  const blocklistText =
    blocklist === undefined ? DEFAULT_FILES_BLOCKLIST.join('\n') : blocklist.join('\n');
  function patchSpec(partial: Record<string, unknown>) {
    const nextSpec = { ...spec, ...partial };
    if (typeof nextSpec.root === 'string' && nextSpec.root.trim() === '') {
      delete nextSpec.root;
    }
    onChange({ spec: nextSpec });
  }
  return (
    <FieldGroup className="gap-2">
      <Field>
        <FieldLabel htmlFor="pack-files-root">Root</FieldLabel>
        <Input
          id="pack-files-root"
          placeholder="Project (default)"
          value={root}
          onChange={(event) => patchSpec({ root: event.target.value })}
        />
        <FieldDescription className="text-[11px] leading-snug">
          Empty inherits the project thread workdir. Set a path to override for this agent.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="pack-files-blocklist">Blocklist</FieldLabel>
        <Textarea
          id="pack-files-blocklist"
          className="min-h-28 font-mono text-[11px]"
          value={blocklistText}
          onChange={(event) => {
            patchSpec({ blocklist: linesFromTextarea(event.target.value) });
          }}
        />
        <FieldDescription className="text-[11px] leading-snug">
          One glob per line. Defaults match library `DEFAULT_PATH_BLOCKLIST`.
        </FieldDescription>
      </Field>
    </FieldGroup>
  );
}
function ShellSettings({
  config,
  onChange,
}: {
  config: PackConfig;
  onChange: (next: PackConfig) => void;
}) {
  const spec = config.spec ?? {};
  const timeout =
    typeof spec.timeout === 'number' && Number.isFinite(spec.timeout)
      ? spec.timeout
      : DEFAULT_SHELL_TIMEOUT_MS;
  function patchSpec(partial: Record<string, unknown>) {
    onChange({ spec: { ...spec, ...partial } });
  }
  return (
    <FieldGroup className="gap-2">
      <Field>
        <FieldLabel htmlFor="pack-shell-timeout">Default timeout (ms)</FieldLabel>
        <Input
          id="pack-shell-timeout"
          type="number"
          min={1}
          max={600000}
          value={String(timeout)}
          onChange={(event) => {
            const raw = event.target.value.trim();
            if (raw === '') {
              patchSpec({ timeout: DEFAULT_SHELL_TIMEOUT_MS });
              return;
            }
            const next = Number(raw);
            if (!Number.isFinite(next)) {
              return;
            }
            patchSpec({ timeout: Math.min(600000, Math.max(1, Math.trunc(next))) });
          }}
        />
        <FieldDescription className="text-[11px] leading-snug">
          Used when the tool call omits `timeout_ms`. Cap 600000. Default 30000. Allow and deny
          command patterns live in Access &amp; security → Rules.
        </FieldDescription>
      </Field>
    </FieldGroup>
  );
}
function linesFromTextarea(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
