import { CalendarIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import type { Matcher } from 'react-day-picker';
import { formatClock, formatShortDate } from '@/shared/lib/format-clock';
import {
  browserLocalDateFromDayKey,
  browserLocalDayKey,
  dayKeyInTimeZone,
} from '@/shared/lib/time-zone';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Calendar } from '@/shared/ui/calendar';
import { Input } from '@/shared/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { auditDayTimeFromIso, auditIsoFromDayTime } from '../model/audit-filters';

function dayToDate(dayKey: string): Date | undefined {
  return browserLocalDateFromDayKey(dayKey) ?? undefined;
}

export function AuditDatePicker({
  placeholder,
  value,
  onChange,
  timeZone,
  notAfterDay,
  notBeforeDay,
  testId,
}: {
  placeholder: string;
  value: string;
  onChange: (iso: string) => void;
  timeZone: string;
  notAfterDay?: string;
  notBeforeDay?: string;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const set = value.length > 0 ? auditDayTimeFromIso(timeZone, value) : null;
  const selected = set ? dayToDate(set.dayKey) : undefined;
  const zoneToday = dayToDate(dayKeyInTimeZone(timeZone, new Date()));

  const pick = (date: Date | undefined): void => {
    if (!date) {
      onChange('');
      return;
    }
    const time = set?.time ?? '00:00';
    onChange(auditIsoFromDayTime(timeZone, browserLocalDayKey(date), time));
  };

  const changeTime = (time: string): void => {
    if (!set) {
      return;
    }
    onChange(auditIsoFromDayTime(timeZone, set.dayKey, time.length > 0 ? time : '00:00'));
  };

  const before = notBeforeDay ? dayToDate(notBeforeDay) : undefined;
  const after = notAfterDay ? dayToDate(notAfterDay) : undefined;
  let disabled: Matcher | undefined;
  if (before !== undefined && after !== undefined) {
    disabled = { before, after };
  } else if (before !== undefined) {
    disabled = { before };
  } else if (after !== undefined) {
    disabled = { after };
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'w-40 justify-start gap-2 font-normal',
              value.length === 0 && 'text-muted-foreground',
            )}
            data-testid={testId}
          >
            <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-left">
              {set
                ? `${formatShortDate(value, timeZone)} ${formatClock(value, timeZone)}`
                : placeholder}
            </span>
          </Button>
        }
      />
      <PopoverContent align="start" sideOffset={4} className="w-auto gap-1 p-2">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          timeZone={timeZone}
          selected={selected}
          defaultMonth={selected ?? zoneToday}
          disabled={disabled}
          onSelect={pick}
          data-testid={`${testId}-calendar`}
        />
        <div className="flex items-center gap-2 px-1">
          <Input
            type="time"
            aria-label={`${placeholder} time`}
            className="w-28"
            value={set?.time ?? ''}
            disabled={!set}
            onChange={(event) => {
              changeTime(event.target.value);
            }}
            data-testid={`${testId}-time`}
          />
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto text-muted-foreground"
            disabled={value.length === 0}
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
            data-testid={`${testId}-clear`}
          >
            <XIcon className="size-3" />
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
