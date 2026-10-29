import { CalendarIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { formatFullDate } from '@/shared/lib/format-clock';
import {
  browserLocalDateFromDayKey,
  browserLocalDayKey,
  dayKeyInTimeZone,
} from '@/shared/lib/time-zone';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Calendar } from '@/shared/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { fromDateInputValue, toDateInputValue } from '../../model/issue-meta';

export function IssueDueDate({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const timeZone = useOrgTimeZone();
  const [open, setOpen] = useState(false);
  const dayKey = value ? toDateInputValue(value) : '';
  const valid = dayKey ? (browserLocalDateFromDayKey(dayKey) ?? undefined) : undefined;
  const zoneToday = browserLocalDateFromDayKey(dayKeyInTimeZone(timeZone, new Date())) ?? undefined;

  const pick = (date: Date | undefined): void => {
    if (!date) {
      onChange(null);
      return;
    }
    onChange(fromDateInputValue(browserLocalDayKey(date)));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn(
              'w-full justify-start gap-2 font-normal text-xs',
              !value && 'text-muted-foreground',
            )}
            data-testid="issue-drawer-due-date"
          >
            <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-left">
              {dayKey ? formatFullDate(dayKey, timeZone) : 'No due date'}
            </span>
          </Button>
        }
      />
      <PopoverContent align="start" sideOffset={4} className="w-auto gap-1 p-2">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          timeZone={timeZone}
          selected={valid}
          defaultMonth={valid ?? zoneToday}
          onSelect={pick}
          data-testid="issue-drawer-due-calendar"
        />
        {value ? (
          <Button
            variant="ghost"
            size="xs"
            className="w-full justify-center text-muted-foreground"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            data-testid="issue-drawer-due-clear"
          >
            <XIcon className="size-3" />
            Clear date
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
