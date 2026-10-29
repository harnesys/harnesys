import type { VaultEntry, VaultEntryKind } from '@harnesys/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2Icon } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { deleteVaultEntry, putVaultEntry, vaultQuery, vaultQueryKeyFor } from '@/shared/api/vault';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { Row, RowList } from '@/shared/ui/capability-rows';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import {
  RowListSkeleton,
  SettingsEmpty,
  SettingsField,
  SettingsSave,
  SettingsSection,
} from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';

const KIND_ITEMS = [
  { value: 'secret', label: 'Secret' },
  { value: 'variable', label: 'Variable' },
] as const;

export function VaultPane({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const vault = useQuery(vaultQuery(orgId));
  const [name, setName] = useState('');
  const [kind, setKind] = useState<VaultEntryKind>('secret');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const secrets = useMemo(
    () => (vault.data?.items ?? []).filter((item) => item.kind === 'secret'),
    [vault.data?.items],
  );
  const variables = useMemo(
    () => (vault.data?.items ?? []).filter((item) => item.kind === 'variable'),
    [vault.data?.items],
  );

  const toggle = (entry: VaultEntry) => {
    const id = `${entry.kind}:${entry.name}`;
    setExpandedId((current) => (current === id ? null : id));
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      putVaultEntry(orgId, name.trim(), {
        kind,
        value,
      }),
    onSuccess: async () => {
      setName('');
      setValue('');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeyFor(orgId) });
      toast.add({
        title: `${kind === 'secret' ? 'Secret' : 'Variable'} saved`,
        description: name.trim(),
      });
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to save vault entry');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (entryName: string) => deleteVaultEntry(orgId, entryName),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeyFor(orgId) });
    },
  });

  const update = useMutation({
    mutationFn: (input: { entry: VaultEntry; value: string }) =>
      putVaultEntry(orgId, input.entry.name, { kind: input.entry.kind, value: input.value }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeyFor(orgId) });
      setExpandedId(null);
      toast.add({
        title: `${input.entry.kind === 'secret' ? 'Secret' : 'Variable'} updated`,
        description: input.entry.name,
      });
    },
    onError: (err: Error) => {
      toast.add({ title: err.message || 'Failed to update vault entry' });
    },
  });

  function onDelete(entry: VaultEntry) {
    void alert
      .confirm({
        title: `Delete ${entry.kind} “${entry.name}”?`,
        description:
          entry.kind === 'secret'
            ? 'Providers or MCP configs that reference this secret will stop resolving until you recreate it.'
            : 'References to this variable will resolve empty until you recreate it.',
        confirmText: 'Delete',
        variant: 'destructive',
      })
      .then((ok) => {
        if (ok) {
          deleteMutation.mutate(entry.name);
        }
      });
  }

  const canSave = name.trim().length > 0 && value.length > 0;

  return (
    <div className="flex w-full flex-col gap-8" data-testid="vault-pane">
      <SettingsSection
        label="Add entry"
        description={
          <>
            Secrets stay encrypted and are never shown after save. Variables are encrypted at rest
            and shown in this list. Reference them as <code className="font-mono">secret:NAME</code>{' '}
            or <code className="font-mono">var:NAME</code> from MCP and integrations.
          </>
        }
        actions={
          <SettingsSave
            dirty={canSave}
            pending={saveMutation.isPending}
            saveLabel="Save entry"
            onSave={() => {
              setError(null);
              saveMutation.mutate();
            }}
            onDiscard={() => {
              setName('');
              setValue('');
              setError(null);
            }}
            testId="vault-save"
          />
        }
        testId="vault-add"
      >
        <SettingsField label="Name" htmlFor="vault-name">
          <Input
            id="vault-name"
            value={name}
            placeholder="OPENAI_API_KEY"
            autoComplete="off"
            className="font-mono"
            onChange={(event) => setName(event.target.value)}
          />
        </SettingsField>
        <SettingsField label="Kind" htmlFor="vault-kind">
          <Select
            items={[...KIND_ITEMS]}
            value={kind}
            onValueChange={(next) => {
              if (next === 'secret' || next === 'variable') {
                setKind(next);
              }
            }}
          >
            <SelectTrigger id="vault-kind" className="w-full" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {KIND_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingsField>
        <SettingsField label="Value" htmlFor="vault-value" error={error}>
          <Input
            id="vault-value"
            type={kind === 'secret' ? 'password' : 'text'}
            value={value}
            autoComplete="off"
            className="font-mono"
            placeholder={kind === 'secret' ? '••••••••' : 'https://example.com'}
            onChange={(event) => setValue(event.target.value)}
          />
        </SettingsField>
      </SettingsSection>

      <VaultSection
        title="Secrets"
        items={secrets}
        loading={vault.isPending}
        expandedId={expandedId}
        onToggle={toggle}
        onUpdate={(entry, value) => update.mutate({ entry, value })}
        updateBusy={update.isPending}
        onDelete={onDelete}
        busy={deleteMutation.isPending}
      />
      <VaultSection
        title="Variables"
        items={variables}
        loading={vault.isPending}
        expandedId={expandedId}
        onToggle={toggle}
        onUpdate={(entry, value) => update.mutate({ entry, value })}
        updateBusy={update.isPending}
        onDelete={onDelete}
        busy={deleteMutation.isPending}
        showValue
      />
    </div>
  );
}

function VaultSection({
  title,
  items,
  loading,
  expandedId,
  onToggle,
  onUpdate,
  updateBusy,
  onDelete,
  busy,
  showValue = false,
}: {
  title: string;
  items: VaultEntry[];
  loading: boolean;
  expandedId: string | null;
  onToggle: (entry: VaultEntry) => void;
  onUpdate: (entry: VaultEntry, value: string) => void;
  updateBusy: boolean;
  onDelete: (entry: VaultEntry) => void;
  busy: boolean;
  showValue?: boolean;
}) {
  let body: ReactNode;
  if (loading) {
    body = <RowListSkeleton testId={`vault-loading-${title.toLowerCase()}`} />;
  } else if (items.length === 0) {
    body = (
      <SettingsEmpty
        title={`No ${title.toLowerCase()} yet`}
        description="Add one above."
        testId={`vault-empty-${title.toLowerCase()}`}
      />
    );
  } else {
    body = (
      <RowList>
        {items.map((entry) => (
          <VaultRow
            key={`${entry.kind}:${entry.name}`}
            entry={entry}
            expanded={expandedId === `${entry.kind}:${entry.name}`}
            showValue={showValue}
            updateBusy={updateBusy}
            onToggle={() => onToggle(entry)}
            onUpdate={(value) => onUpdate(entry, value)}
            onDelete={() => onDelete(entry)}
            busy={busy}
          />
        ))}
      </RowList>
    );
  }
  return (
    <SettingsSection
      label={title}
      count={loading ? undefined : items.length}
      testId={`vault-section-${title.toLowerCase()}`}
    >
      {body}
    </SettingsSection>
  );
}

function VaultRow({
  entry,
  expanded,
  showValue,
  updateBusy,
  onToggle,
  onUpdate,
  onDelete,
  busy,
}: {
  entry: VaultEntry;
  expanded: boolean;
  showValue: boolean;
  updateBusy: boolean;
  onToggle: () => void;
  onUpdate: (value: string) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const secret = entry.kind === 'secret';
  const [draft, setDraft] = useState(secret ? '' : (entry.value ?? ''));
  return (
    <Row
      testId={`vault-row-${entry.name}`}
      title={entry.name}
      summary={
        showValue && entry.value != null ? (
          <span className="font-mono">{entry.value}</span>
        ) : (
          '••••••••'
        )
      }
      expanded={expanded}
      onToggle={onToggle}
      actions={
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          disabled={busy}
          aria-label={`Delete ${entry.name}`}
          data-testid={`vault-delete-${entry.name}`}
          onClick={onDelete}
        >
          <Trash2Icon />
        </Button>
      }
    >
      <div className="flex items-center gap-2 px-1 pt-1">
        <Input
          type={secret ? 'password' : 'text'}
          value={draft}
          placeholder={secret ? 'New value' : 'Value'}
          autoComplete="off"
          className="font-mono"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && draft.length > 0) {
              event.preventDefault();
              onUpdate(draft);
            }
          }}
          data-testid={`vault-value-${entry.name}`}
        />
        <Button
          type="button"
          size="sm"
          disabled={draft.length === 0 || updateBusy}
          onClick={() => onUpdate(draft)}
          data-testid={`vault-save-${entry.name}`}
        >
          {updateBusy ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </Row>
  );
}
