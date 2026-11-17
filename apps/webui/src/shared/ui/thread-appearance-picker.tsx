import { BanIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { ChannelIcon } from '@/shared/ui/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';

export const CHANNEL_ICON_OPTIONS: readonly string[] = [
  'messages-square',
  'megaphone',
  'flame',
  'rocket',
  'beaker',
  'bug',
  'wrench',
  'shield',
  'zap',
  'bell',
  'star',
  'heart',
  'flag',
  'bookmark',
  'terminal',
  'code',
  'database',
  'cloud',
  'globe',
  'layers',
  'box',
  'briefcase',
  'git-branch',
];

export const CHANNEL_COLOR_PRESETS: readonly string[] = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#22c55e',
  '#10b981',
  '#0ea5e9',
  '#3b82f6',
  '#8b5cf6',
  '#d946ef',
  '#ec4899',
];

export function ThreadIconPicker({
  value,
  onChange,
  testIdPrefix = 'thread-icon',
}: {
  value: string | null;
  onChange: (icon: string | null) => void;
  testIdPrefix?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            className="size-7"
            aria-label="Channel icon"
            title="Channel icon"
            data-testid={`${testIdPrefix}-trigger`}
          />
        }
      >
        <ChannelIcon icon={value} className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <div className="grid grid-cols-6 gap-1">
          <IconOption
            label="Default icon"
            selected={value === null}
            testId={`${testIdPrefix}-default`}
            onClick={() => onChange(null)}
          >
            <ChannelIcon icon={null} className="size-4" />
          </IconOption>
          {CHANNEL_ICON_OPTIONS.map((icon) => (
            <IconOption
              key={icon}
              label={`Icon ${icon}`}
              selected={value === icon}
              testId={`${testIdPrefix}-${icon}`}
              onClick={() => onChange(icon)}
            >
              <ChannelIcon icon={icon} className="size-4" />
            </IconOption>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ThreadColorPicker({
  value,
  onChange,
  testIdPrefix = 'thread-color',
}: {
  value: string | null;
  onChange: (color: string | null) => void;
  testIdPrefix?: string;
}) {
  return (
    <div className="flex items-center gap-1" data-testid={`${testIdPrefix}-picker`}>
      <ColorOption
        label="Default color"
        selected={value === null}
        testId={`${testIdPrefix}-default`}
        onClick={() => onChange(null)}
      >
        <BanIcon className="size-3 text-muted-foreground" aria-hidden />
      </ColorOption>
      {CHANNEL_COLOR_PRESETS.map((color) => (
        <ColorOption
          key={color}
          label={`Color ${color}`}
          selected={value === color}
          testId={`${testIdPrefix}-${color}`}
          onClick={() => onChange(color)}
        >
          <span className="size-3.5 rounded-full" style={{ backgroundColor: color }} />
        </ColorOption>
      ))}
    </div>
  );
}

function IconOption({
  label,
  selected,
  testId,
  onClick,
  children,
}: {
  label: string;
  selected: boolean;
  testId: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground',
        selected && 'bg-accent text-foreground ring-1 ring-ring/50',
      )}
    >
      {children}
    </button>
  );
}

function ColorOption({
  label,
  selected,
  testId,
  onClick,
  children,
}: {
  label: string;
  selected: boolean;
  testId: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'flex size-6 items-center justify-center rounded-full outline-none transition-colors',
        selected && 'ring-2 ring-ring/60',
      )}
    >
      {children}
    </button>
  );
}
