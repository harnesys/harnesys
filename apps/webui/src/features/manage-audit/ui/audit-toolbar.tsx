import { SearchIcon, XIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';
import {
  AUDIT_ACTOR_KIND_OPTIONS,
  AUDIT_RANGE_CUSTOM,
  AUDIT_RANGE_PRESETS,
  AUDIT_RESULT_OPTIONS,
  type AuditFilterOption,
  type AuditFilterState,
  auditBoundaryDayKey,
} from '../model/audit-filters';
import { AuditDatePicker } from './audit-date-picker';

function FilterSelect({
  label,
  options,
  value,
  onChange,
  testId,
}: {
  label: string;
  options: readonly AuditFilterOption[];
  value: string;
  onChange: (value: string) => void;
  testId: string;
}) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(next) => {
        if (typeof next === 'string') {
          onChange(next);
        }
      }}
    >
      <SelectTrigger size="sm" aria-label={`Filter by ${label.toLowerCase()}`} data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RangeControl({
  filters,
  timeZone,
  onChange,
}: {
  filters: AuditFilterState;
  timeZone: string;
  onChange: (patch: Partial<AuditFilterState>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        variant="segment"
        size="sm"
        aria-label="Date range"
        value={[String(filters.preset)]}
        onValueChange={(next) => {
          const picked = next[0];
          if (picked === AUDIT_RANGE_CUSTOM) {
            onChange({ preset: AUDIT_RANGE_CUSTOM });
            return;
          }
          const found = AUDIT_RANGE_PRESETS.find((preset) => String(preset) === picked);
          if (found !== undefined) {
            onChange({ preset: found });
          }
        }}
        data-testid="audit-range-toggle"
      >
        {AUDIT_RANGE_PRESETS.map((preset) => (
          <ToggleGroupItem key={preset} value={String(preset)}>
            {preset}d
          </ToggleGroupItem>
        ))}
        <ToggleGroupItem value={AUDIT_RANGE_CUSTOM}>Custom</ToggleGroupItem>
      </ToggleGroup>
      {filters.preset === AUDIT_RANGE_CUSTOM ? (
        <div
          className="flex flex-wrap items-center gap-2 sm:ml-auto"
          data-testid="audit-custom-range"
        >
          <AuditDatePicker
            placeholder="From"
            value={filters.customFrom}
            timeZone={timeZone}
            notAfterDay={auditBoundaryDayKey(timeZone, filters.customTo)}
            onChange={(iso) => {
              onChange({ customFrom: iso });
            }}
            testId="audit-from"
          />
          <AuditDatePicker
            placeholder="To"
            value={filters.customTo}
            timeZone={timeZone}
            notBeforeDay={auditBoundaryDayKey(timeZone, filters.customFrom)}
            onChange={(iso) => {
              onChange({ customTo: iso });
            }}
            testId="audit-to"
          />
        </div>
      ) : null}
    </div>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative w-full min-w-0 sm:max-w-xs">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        aria-label="Search audit events"
        placeholder="Search resource or actor..."
        className="pr-8 pl-8"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      {value.length > 0 ? (
        <button
          type="button"
          aria-label="Clear search"
          className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => {
            onChange('');
          }}
        >
          <XIcon className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function AuditToolbar({
  filters,
  timeZone,
  dirty,
  onChange,
  onReset,
}: {
  filters: AuditFilterState;
  timeZone: string;
  dirty: boolean;
  onChange: (patch: Partial<AuditFilterState>) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col gap-2" data-testid="audit-filters">
      <RangeControl filters={filters} timeZone={timeZone} onChange={onChange} />
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          value={filters.q}
          onChange={(q) => {
            onChange({ q });
          }}
        />
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {dirty ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={onReset}
              data-testid="audit-reset"
            >
              Reset filters
            </Button>
          ) : null}
          <FilterSelect
            label="Actor"
            options={AUDIT_ACTOR_KIND_OPTIONS}
            value={filters.actorKind}
            onChange={(actorKind) => {
              onChange({ actorKind });
            }}
            testId="audit-actor-filter"
          />
          <FilterSelect
            label="Result"
            options={AUDIT_RESULT_OPTIONS}
            value={filters.result}
            onChange={(result) => {
              onChange({ result });
            }}
            testId="audit-result-filter"
          />
        </div>
      </div>
    </div>
  );
}
