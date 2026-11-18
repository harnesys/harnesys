import type {
  DashboardCatalogEntryDto,
  Expr,
  OrgApiSource,
  WidgetSource,
} from '@harnesys/contracts';
import { orgApiRiskPrefix } from '@harnesys/contracts';
import {
  ChevronDownIcon,
  LoaderCircleIcon,
  PlayIcon,
  ShieldAlertIcon,
  TrashIcon,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { catalogEntryForPath, responsePaths } from '../../model/binding-paths';
import { type PropFieldSpec, schemaFieldSpecs } from '../../model/prop-fields';
import { ExternalFields } from './inspector-external-fields';
import { RefreshFields } from './inspector-refresh';
import type { TestOutcome } from './source-test';

const CUSTOM_ENTRY_ID = 'custom';

interface SourceCardProps {
  source: WidgetSource;
  orgId: string;
  catalog: DashboardCatalogEntryDto[];
  testResult: TestOutcome | null;
  testing: boolean;
  onTest: () => void;
  onRemove: () => void;
  onPatch: (next: Partial<WidgetSource>) => void;
}

export function SourceCard({
  source,
  orgId,
  catalog,
  testResult,
  testing,
  onTest,
  onRemove,
  onPatch,
}: SourceCardProps): React.ReactNode {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-2.5">
      <div className="flex items-center gap-2">
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">
          {source.kind}
        </span>
        <Input
          value={source.id}
          onChange={(event) => onPatch({ id: event.target.value })}
          className="h-6 flex-1 font-mono text-[11px]"
          aria-label="Source id"
        />
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Test source"
          disabled={testing}
          onClick={onTest}
        >
          {testing ? <LoaderCircleIcon className="animate-spin" /> : <PlayIcon />}
        </Button>
        <Button variant="ghost" size="icon-xs" aria-label="Remove source" onClick={onRemove}>
          <TrashIcon />
        </Button>
      </div>
      {source.kind === 'orgApi' ? (
        <OrgApiFields source={source} orgId={orgId} catalog={catalog} onPatch={onPatch} />
      ) : (
        <ExternalFields source={source} onPatch={onPatch} />
      )}
      <RefreshFields source={source} onPatch={onPatch} />
      {testResult ? (
        <pre
          className={cn(
            'max-h-40 overflow-auto whitespace-pre-wrap rounded-md px-2 py-1.5 font-mono text-[10px] leading-relaxed',
            testResult.ok
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'bg-destructive/10 text-destructive',
          )}
        >
          {testResult.text}
        </pre>
      ) : null}
    </div>
  );
}

function OrgApiFields({
  source,
  orgId,
  catalog,
  onPatch,
}: {
  source: OrgApiSource;
  orgId: string;
  catalog: DashboardCatalogEntryDto[];
  onPatch: (next: Partial<WidgetSource>) => void;
}): React.ReactNode {
  const entry = catalogEntryForPath(catalog, source.path, orgId);
  const catalogId = entry?.id ?? CUSTOM_ENTRY_ID;
  const fields = schemaFieldSpecs(entry?.querySchema ?? undefined);

  const pickResource = (id: string): void => {
    const next = catalog.find((candidate) => candidate.id === id);
    onPatch({
      path: next ? next.path.replaceAll(':orgId', orgId) : `/orgs/${orgId}/`,
      query: undefined,
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="w-14 shrink-0 text-[11px] text-muted-foreground">Method</span>
        <Select
          value={source.method}
          onValueChange={(method) =>
            method && onPatch({ method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' })
          }
        >
          <SelectTrigger size="sm" className="w-24" aria-label="Method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['GET', 'POST', 'PUT', 'PATCH'] as const).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-14 shrink-0 text-[11px] text-muted-foreground">Resource</span>
        <Select
          value={catalogId}
          onValueChange={(id) => {
            if (id) {
              pickResource(id);
            }
          }}
        >
          <SelectTrigger size="sm" className="flex-1" aria-label="Org API resource">
            <SelectValue placeholder="Pick resource" />
          </SelectTrigger>
          <SelectContent>
            {catalog.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM_ENTRY_ID}>Custom path</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {entry ? (
        <div className="flex flex-col gap-0.5 pl-16">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-mono text-[10px] text-muted-foreground/70">
              {source.path}
            </span>
            {orgApiRiskPrefix(source.path) ? (
              <span className="flex shrink-0 items-center gap-0.5 rounded bg-destructive/10 px-1 py-0.5 text-[9px] text-destructive uppercase">
                <ShieldAlertIcon className="size-2.5" /> risky
              </span>
            ) : null}
          </div>
          {entry.description ? (
            <p className="text-[10px] text-muted-foreground/70">{entry.description}</p>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="w-14 shrink-0 text-[11px] text-muted-foreground">Path</span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            /orgs/{orgId}
          </span>
          <Input
            value={
              source.path.startsWith(`/orgs/${orgId}`)
                ? source.path.slice(`/orgs/${orgId}`.length)
                : source.path
            }
            placeholder="/threads"
            onChange={(event) => onPatch({ path: `/orgs/${orgId}${event.target.value}` })}
            className="h-6 flex-1 font-mono text-[11px]"
            aria-label="API path"
          />
        </div>
      )}
      <ResponseFields entry={entry} sourceId={source.id} />
      {fields.length > 0 ? (
        <p className="pl-16 font-mono text-[9px] text-muted-foreground/60 uppercase tracking-wide">
          Query parameters
        </p>
      ) : (
        <p className="pl-16 text-[10px] text-muted-foreground/60">No query parameters</p>
      )}
      {fields.map((field) => (
        <QueryField
          key={field.key}
          spec={field}
          value={queryText(source.query?.[field.key])}
          onChange={(value) => {
            const query = { ...source.query };
            if (value === '') {
              delete query[field.key];
            } else {
              query[field.key] = value;
            }
            onPatch({ query: Object.keys(query).length > 0 ? query : undefined });
          }}
        />
      ))}
    </div>
  );
}

/** Response shape from the catalog entry schema, so the author sees what a resource returns. */
function ResponseFields({
  entry,
  sourceId,
}: {
  entry: DashboardCatalogEntryDto | undefined;
  sourceId: string;
}): React.ReactNode {
  if (!entry) {
    return null;
  }
  const prefix = `sources.${sourceId}`;
  const paths = responsePaths(entry.responseSchema, sourceId).map((path) =>
    path.startsWith(`${prefix}.`) ? path.slice(prefix.length + 1) : path,
  );
  if (paths.length === 0) {
    return null;
  }
  return (
    <details className="pl-16">
      <summary className="flex cursor-pointer items-center gap-1 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">
        <ChevronDownIcon className="size-3" />
        Response fields ({paths.length})
      </summary>
      <ul className="mt-1 flex flex-col gap-0.5 pb-1">
        {paths.slice(0, 40).map((path) => (
          <li key={path} className="truncate font-mono text-[10px] text-muted-foreground leading-4">
            {path}
          </li>
        ))}
        {paths.length > 40 ? (
          <li className="text-[10px] text-muted-foreground/60 leading-4">
            +{paths.length - 40} more
          </li>
        ) : null}
      </ul>
    </details>
  );
}

/** Query values are Exprs; the inspector edits the plain string literal form. */
function queryText(value: Expr | undefined): string {
  if (value === undefined) {
    return '';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function QueryField({
  spec,
  value,
  onChange,
}: {
  spec: PropFieldSpec;
  value: string;
  onChange: (value: string) => void;
}): React.ReactNode {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-14 shrink-0 text-[11px] text-muted-foreground">{spec.label}</span>
      {spec.options && spec.options.length > 0 ? (
        <Select
          value={value || 'all'}
          onValueChange={(next) => {
            if (next) {
              onChange(next === 'all' ? '' : next);
            }
          }}
        >
          <SelectTrigger size="sm" className="flex-1" aria-label={`Query ${spec.key}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {spec.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          value={value}
          placeholder={spec.hint}
          onChange={(event) => onChange(event.target.value)}
          className="h-6 flex-1 font-mono text-[11px]"
          aria-label={`Query ${spec.key}`}
        />
      )}
    </div>
  );
}
