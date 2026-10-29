import { useQuery } from '@tanstack/react-query';
import { providersQuery } from '@/shared/api';
import { getActiveOrgId } from '@/shared/api/active-org';
import { cn } from '@/shared/lib/utils';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { modelGroups, modelOptions } from '../model/model-groups';

interface ModelSelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  triggerClassName?: string;
  size?: 'sm' | 'default';
  orgId?: string;
  emptyLabel?: string;
}
export function ModelSelect({
  value,
  onChange,
  disabled,
  id,
  placeholder = 'Select model',
  triggerClassName,
  size = 'default',
  emptyLabel,
}: ModelSelectProps) {
  const providers = useQuery(providersQuery(getActiveOrgId() ?? '')).data ?? [];
  const groups = modelGroups(providers);
  const items = modelOptions(groups);
  const hasEmptyOption = emptyLabel !== undefined;
  const empty = items.length === 0;
  const selected = items.find((item) => item.value === value);
  const selectedLabel = selected?.name;
  const emptySelected = hasEmptyOption && (value === null || value === '');
  let triggerPlaceholder = empty ? 'Attach a model first' : placeholder;
  if (emptySelected) {
    triggerPlaceholder = emptyLabel;
  }
  return (
    <Select
      items={[
        ...(hasEmptyOption ? [{ value: '', label: emptyLabel }] : []),
        ...items.map((item) => ({
          value: item.value,
          label: item.usable ? item.name : `${item.name} — ${item.reason}`,
        })),
      ]}
      value={hasEmptyOption ? (value ?? '') : value || null}
      onValueChange={(next) => {
        if (typeof next === 'string') {
          onChange(next === '' ? null : next);
        }
      }}
      disabled={disabled || (!hasEmptyOption && empty)}
    >
      <SelectTrigger id={id} size={size} className={triggerClassName} data-testid="model-select">
        {selectedLabel ? (
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-left font-mono',
              !selected?.usable && 'text-status-warn',
            )}
            title={selected?.usable ? undefined : `Model unavailable: ${selected?.reason}`}
          >
            {selectedLabel}
          </span>
        ) : (
          <SelectValue placeholder={triggerPlaceholder} />
        )}
      </SelectTrigger>
      <SelectContent className="w-full" align="start">
        {hasEmptyOption ? (
          <>
            <SelectItem value="">{emptyLabel}</SelectItem>
            <SelectSeparator />
          </>
        ) : null}
        {groups.map((group) => (
          <SelectGroup key={group.provider}>
            <SelectLabel>{group.provider}</SelectLabel>
            {group.models.map((item) => (
              <SelectItem
                key={item.value}
                value={item.value}
                disabled={!item.usable}
                className="font-mono"
              >
                {item.usable ? item.name : `${item.name} — ${item.reason}`}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
