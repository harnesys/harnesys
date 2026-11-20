import type { FieldSpec } from '@harnesys/contracts';
import { useFieldOptions } from '@/shared/descriptor-forms/ui/widgets/use-field-options';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { resolveL10nText } from '../lib/route-call';
import type { AddonTableFilter } from '../lib/view-sections';

const ALL_VALUE = '__all__';

export function TableToolbar({
  orgId,
  addonId,
  filters,
  values,
  disabled,
  onFilter,
  searchEnabled,
  search,
  onSearch,
}: {
  orgId: string;
  addonId: string;
  filters: AddonTableFilter[];
  values: Record<string, string>;
  disabled: boolean;
  onFilter: (key: string, value: string) => void;
  searchEnabled: boolean;
  search: string;
  onSearch: (value: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {filters.map((filter) => (
        <TableFilterSelect
          key={filter.key}
          orgId={orgId}
          addonId={addonId}
          filter={filter}
          value={values[filter.key] ?? ''}
          disabled={disabled}
          onChange={(value) => onFilter(filter.key, value)}
        />
      ))}
      {searchEnabled ? (
        <Input
          value={search}
          placeholder="Search..."
          className="ml-auto h-8 w-48"
          disabled={disabled}
          onChange={(event) => onSearch(event.target.value)}
          data-testid="addon-table-search"
        />
      ) : null}
    </div>
  );
}

function TableFilterSelect({
  orgId,
  addonId,
  filter,
  value,
  disabled,
  onChange,
}: {
  orgId: string;
  addonId: string;
  filter: AddonTableFilter;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const { options, loading } = useFilterOptions(orgId, addonId, filter);
  return (
    <Select
      items={options.map((option) => ({ value: option.value, label: option.label }))}
      value={value === '' ? null : value}
      disabled={disabled}
      onValueChange={(next) => {
        if (typeof next === 'string') {
          onChange(next === ALL_VALUE ? '' : next);
        }
      }}
    >
      <SelectTrigger className="h-8 w-44" data-testid={`addon-table-filter-${filter.key}`}>
        <SelectValue
          placeholder={
            loading && options.length === 0 ? 'Loading...' : resolveL10nText(filter.label)
          }
        />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

/**
 * Filter options: static `options` or an add-on GET route, resolved through
 * the same option machinery the descriptor forms use.
 */
function useFilterOptions(orgId: string, addonId: string, filter: AddonTableFilter) {
  const source = filter.optionsFrom;
  const spec: FieldSpec = {
    key: `filter-${filter.key}`,
    label: resolveL10nText(filter.label),
    type: 'select',
    required: false,
    options: filter.options,
    optionsFrom:
      source === undefined
        ? undefined
        : {
            kind: 'addonRoute',
            route: source.route,
            valueKey: source.valueKey,
            labelKey: source.labelKey,
          },
  };
  const { options, loading } = useFieldOptions(spec, {}, { orgId, addonId, connections: [] });
  const withAll = [{ value: ALL_VALUE, label: 'All' }, ...options];
  return { options: withAll, loading };
}
