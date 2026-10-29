import type { PackConfig } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import {
  type EngineSpec,
  type OrgBrowserView,
  orgBrowserQuery,
} from '@/features/manage-org-browser/org-browser-api';
import { getActiveOrgId } from '@/shared/api/active-org';
import { Badge } from '@/shared/ui/badge';
import { Checkbox } from '@/shared/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

const DEFAULT_WEB_SEARCH_MAX_RESULTS = 5;
const MAX_WEB_SEARCH_RESULTS = 20;
const DEFAULT_SEARXNG_URL = 'http://localhost:8888';
const WEB_ENGINE_ORG_DEFAULT = 'org-default';
type WebSearchProvider = 'duckduckgo' | 'searxng';
const WEB_SEARCH_PROVIDERS: readonly WebSearchProvider[] = ['duckduckgo', 'searxng'];

interface WebEngineOption {
  value: string;
  engineId: string;
  label: string;
}

function engineLabel(engines: readonly EngineSpec[], engineId: string): string {
  return engines.find((engine) => engine.id === engineId)?.label ?? engineId;
}

function engineIdOf(value: string): string {
  const at = value.indexOf('@');
  return at <= 0 ? value : value.slice(0, at);
}

function versionOf(value: string, engineId: string): string | undefined {
  if (value === engineId || !value.startsWith(`${engineId}@`)) {
    return undefined;
  }
  return value.slice(engineId.length + 1);
}

function isUsableEntry(entry: { installed: boolean; enabled: boolean; broken?: boolean }): boolean {
  return entry.installed && entry.enabled && entry.broken !== true;
}

function installedEngineOptions(view: OrgBrowserView | undefined): WebEngineOption[] {
  if (!view) {
    return [];
  }
  const options: WebEngineOption[] = [];
  const seen = new Set<string>();
  for (const host of view.hosts) {
    for (const entry of host.entries) {
      if (!isUsableEntry(entry)) {
        continue;
      }
      const label = engineLabel(view.engines, entry.engineId);
      const versions = entry.versions ?? (entry.version !== undefined ? [entry.version] : []);
      const values =
        versions.length > 0
          ? versions.map((version) => `${entry.engineId}@${version}`)
          : [entry.engineId];
      for (const value of values) {
        if (seen.has(value)) {
          continue;
        }
        seen.add(value);
        const version = versionOf(value, entry.engineId);
        options.push({
          value,
          engineId: entry.engineId,
          label: version === undefined ? label : `${label} ${version}`,
        });
      }
    }
  }
  return options;
}

function primaryOptionValue(view: OrgBrowserView | undefined, engineId: string): string | null {
  if (!view) {
    return null;
  }
  for (const host of view.hosts) {
    const entry = host.entries.find(
      (candidate) => candidate.engineId === engineId && isUsableEntry(candidate),
    );
    if (entry === undefined) {
      continue;
    }
    return entry.version !== undefined ? `${engineId}@${entry.version}` : engineId;
  }
  return null;
}

export function WebPackSettings({
  config,
  onChange,
}: {
  config: PackConfig;
  onChange: (next: PackConfig) => void;
}) {
  const orgId = getActiveOrgId() ?? '';
  const browserQuery = useQuery(orgBrowserQuery(orgId));
  const engineCatalog = browserQuery.data?.engines ?? [];
  const orgDefaultEngineId =
    browserQuery.data !== undefined && browserQuery.data.defaultEngine !== 'auto'
      ? browserQuery.data.defaultEngine
      : null;
  const spec = config.spec ?? {};
  const provider: WebSearchProvider = spec.provider === 'searxng' ? 'searxng' : 'duckduckgo';
  const searxngUrl = typeof spec.searxngUrl === 'string' ? spec.searxngUrl : '';
  const maxResults =
    typeof spec.maxResults === 'number' && Number.isFinite(spec.maxResults)
      ? spec.maxResults
      : DEFAULT_WEB_SEARCH_MAX_RESULTS;
  const pinnedRaw =
    typeof spec.engine === 'string' &&
    spec.engine !== '' &&
    spec.engine !== 'auto' &&
    spec.engine !== WEB_ENGINE_ORG_DEFAULT
      ? spec.engine
      : null;
  const installedOptions = installedEngineOptions(browserQuery.data);
  const orgDefaultPrimary =
    orgDefaultEngineId === null ? null : primaryOptionValue(browserQuery.data, orgDefaultEngineId);
  const pinnedPrimary =
    pinnedRaw === null
      ? null
      : (primaryOptionValue(browserQuery.data, engineIdOf(pinnedRaw)) ?? pinnedRaw);
  const selectedValue = pinnedPrimary ?? orgDefaultPrimary ?? '';
  const selectedId = engineIdOf(selectedValue);
  const fallbackLabel = `${engineLabel(engineCatalog, selectedId)}${
    versionOf(selectedValue, selectedId) === undefined
      ? ''
      : ` ${versionOf(selectedValue, selectedId)}`
  }`;
  const engineOptions: WebEngineOption[] =
    selectedValue !== '' && !installedOptions.some((option) => option.value === selectedValue)
      ? [...installedOptions, { value: selectedValue, engineId: selectedId, label: fallbackLabel }]
      : installedOptions;
  const selectedEngineSpec = engineCatalog.find((candidate) => candidate.id === selectedId);
  const allowPrivateNetwork = spec.allowPrivateNetwork === true;
  const stealth = spec.stealth === true;
  const headed = spec.headed === true;
  function patchSpec(partial: Record<string, unknown>) {
    const nextSpec = { ...spec, ...partial };
    if (typeof nextSpec.searxngUrl === 'string' && nextSpec.searxngUrl.trim() === '') {
      delete nextSpec.searxngUrl;
    }
    if (nextSpec.engine === WEB_ENGINE_ORG_DEFAULT) {
      delete nextSpec.engine;
    }
    onChange({ spec: nextSpec });
  }
  return (
    <FieldGroup className="gap-2">
      <p className="font-medium text-muted-foreground text-xs">Search</p>
      <Field>
        <FieldLabel>Provider</FieldLabel>
        <ToggleGroup
          variant="segment"
          size="sm"
          value={[provider]}
          onValueChange={(value) => {
            const next = value[0];
            if (next === 'duckduckgo' || next === 'searxng') {
              patchSpec({ provider: next });
            }
          }}
        >
          {WEB_SEARCH_PROVIDERS.map((name) => (
            <ToggleGroupItem key={name} value={name} className="min-w-[44px] text-[11px]">
              {name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <FieldDescription className="text-[11px] leading-snug">
          duckduckgo works without setup. searxng needs a self-hosted instance with the JSON API.
        </FieldDescription>
      </Field>
      {provider === 'searxng' && (
        <Field>
          <FieldLabel htmlFor="pack-web-searxng-url">SearXNG URL</FieldLabel>
          <Input
            id="pack-web-searxng-url"
            placeholder={DEFAULT_SEARXNG_URL}
            value={searxngUrl}
            onChange={(event) => patchSpec({ searxngUrl: event.target.value })}
          />
          <FieldDescription className="text-[11px] leading-snug">
            Base URL of the SearXNG instance. Empty falls back to http://localhost:8888.
          </FieldDescription>
        </Field>
      )}
      <Field>
        <FieldLabel htmlFor="pack-web-max-results">Max results</FieldLabel>
        <Input
          id="pack-web-max-results"
          type="number"
          min="1"
          max={MAX_WEB_SEARCH_RESULTS}
          value={String(maxResults)}
          onChange={(event) => {
            const raw = event.target.value.trim();
            if (raw === '') {
              patchSpec({ maxResults: DEFAULT_WEB_SEARCH_MAX_RESULTS });
              return;
            }
            const next = Number(raw);
            if (!Number.isFinite(next)) {
              return;
            }
            const clamped = Math.min(MAX_WEB_SEARCH_RESULTS, Math.max(1, Math.trunc(next)));
            patchSpec({ maxResults: clamped });
          }}
        />
        <FieldDescription className="text-[11px] leading-snug">
          Result cap when the tool call omits `max_results`. Range 1–20. Default 5.
        </FieldDescription>
      </Field>
      <p className="font-medium text-muted-foreground text-xs">Browser</p>
      <Field>
        <FieldLabel htmlFor="pack-web-engine">Engine</FieldLabel>
        <Select
          value={selectedValue}
          onValueChange={(value) => {
            if (typeof value !== 'string') {
              return;
            }
            if (orgDefaultPrimary !== null && value === orgDefaultPrimary) {
              patchSpec({ engine: WEB_ENGINE_ORG_DEFAULT });
              return;
            }
            patchSpec({ engine: value });
          }}
        >
          <SelectTrigger id="pack-web-engine" size="sm" className="w-full">
            <SelectValue>
              {(value) =>
                typeof value === 'string' && value !== ''
                  ? (engineOptions.find((option) => option.value === value)?.label ?? value)
                  : 'Auto'
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {engineOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
                {option.value === orgDefaultPrimary && (
                  <Badge
                    variant="secondary"
                    className="h-4 rounded-sm px-1.5 font-normal text-[10px]"
                  >
                    default
                  </Badge>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription className="text-[11px] leading-snug">
          Every installed version is its own option. The badged option follows the organization
          default; picking any other option pins that engine and version for this agent.
        </FieldDescription>
      </Field>
      <Field>
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2 rounded-md px-1 py-0.5">
            <Checkbox
              className="mt-0.5"
              id="pack-web-allow-private-network"
              checked={allowPrivateNetwork}
              onCheckedChange={(next) => patchSpec({ allowPrivateNetwork: Boolean(next) })}
            />
            <span className="text-[11px] leading-snug">Allow private network (SSRF guard off)</span>
          </div>
          <div className="flex items-start gap-2 rounded-md px-1 py-0.5">
            <Checkbox
              className="mt-0.5"
              id="pack-web-stealth"
              checked={stealth}
              disabled={selectedEngineSpec?.capabilities.stealth !== true}
              onCheckedChange={(next) => patchSpec({ stealth: Boolean(next) })}
            />
            <span className="text-[11px] leading-snug">Stealth (Obscura only)</span>
          </div>
          <div className="flex items-start gap-2 rounded-md px-1 py-0.5">
            <Checkbox
              className="mt-0.5"
              id="pack-web-headed"
              checked={headed}
              disabled={
                selectedEngineSpec !== undefined && selectedEngineSpec.capabilities.headed !== true
              }
              onCheckedChange={(next) => patchSpec({ headed: Boolean(next) })}
            />
            <span className="text-[11px] leading-snug">
              Headed window (visible browser for logins and captchas)
            </span>
          </div>
        </div>
      </Field>
    </FieldGroup>
  );
}
