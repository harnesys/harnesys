import { CheckIcon, LaptopIcon, type LucideIcon, MoonIcon, SunIcon } from 'lucide-react';
import {
  isUiAccent,
  isUiScale,
  UI_ACCENT_SWATCHES,
  UI_ACCENTS,
  UI_SCALE_LABELS,
  UI_SCALES,
  type UiTheme,
} from '@/shared/lib/appearance';
import { cn } from '@/shared/lib/utils';
import { ColorSwatches, type ColorSwatchItem } from '@/shared/ui/color-swatches';
import { SettingsField, SettingsOptionGrid, SettingsSection } from '@/shared/ui/settings-kit';
import { useTheme } from '@/shared/ui/theme-provider';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';
import { SidebarLayoutPicker } from './sidebar-layout-picker';

const THEME_CHOICES: {
  value: UiTheme;
  label: string;
  icon: LucideIcon;
}[] = [
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'system', label: 'System', icon: LaptopIcon },
];

const ACCENT_SWATCH_ITEMS: ColorSwatchItem[] = UI_ACCENTS.map((id) => ({
  value: id,
  label: UI_ACCENT_SWATCHES[id].label,
  color: UI_ACCENT_SWATCHES[id].swatch,
}));

export function AppearancePane() {
  const { theme, setTheme, scale, setScale, accent, setAccent } = useTheme();

  return (
    <div className="flex w-full flex-col gap-8" data-testid="appearance-pane">
      <SettingsSection
        label="Theme"
        description="Follow the system or pick one."
        testId="theme-select"
      >
        <SettingsOptionGrid columns={3} className="max-w-md">
          {THEME_CHOICES.map(({ value, label, icon: Icon }) => {
            const selected = theme === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                data-testid={`theme-${value}`}
                onClick={() => setTheme(value)}
                className={cn(
                  'flex flex-col gap-1.5 rounded-lg border bg-transparent p-1.5 text-left outline-none transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  selected ? 'border-live' : 'border-border hover:border-foreground/25',
                )}
              >
                <span className="relative block h-16 w-full overflow-hidden rounded-md border border-border">
                  <ThemePreview choice={value} />
                </span>
                <span className="flex w-full items-center gap-1.5 px-0.5 text-sm">
                  <Icon className="size-3.5 text-muted-foreground" />
                  {label}
                  {selected ? <CheckIcon className="ml-auto size-3.5 text-live" /> : null}
                </span>
              </button>
            );
          })}
        </SettingsOptionGrid>
      </SettingsSection>

      <SettingsSection
        label="Sidebar"
        description="How navigation is arranged while you work."
        testId="sidebar-layout-select"
      >
        <SidebarLayoutPicker />
      </SettingsSection>

      <SettingsSection
        label="Interface"
        description="Accent and text size for the whole app."
        testId="interface-select"
      >
        <SettingsField
          label="Accent"
          description="Highlight color for live state, focus rings, and charts."
          testId="accent-select"
        >
          <ColorSwatches
            value={accent}
            testIdPrefix="accent"
            items={ACCENT_SWATCH_ITEMS}
            onChange={(next) => {
              if (isUiAccent(next)) {
                setAccent(next);
              }
            }}
          />
        </SettingsField>
        <SettingsField label="Scale" description="Overall UI text size." testId="scale-select">
          <ToggleGroup
            aria-label="Scale"
            variant="segment"
            value={[scale]}
            onValueChange={(value) => {
              const next = value[0];
              if (next && isUiScale(next)) {
                setScale(next);
              }
            }}
          >
            {UI_SCALES.map((item) => (
              <ToggleGroupItem key={item} value={item}>
                {UI_SCALE_LABELS[item]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </SettingsField>
      </SettingsSection>
    </div>
  );
}

function ThemePreview({ choice }: { choice: UiTheme }) {
  if (choice === 'system') {
    return (
      <span className="absolute inset-0 flex">
        <span className="relative flex-1">
          <MiniWindow variant="light" />
        </span>
        <span className="relative flex-1">
          <MiniWindow variant="dark" />
        </span>
      </span>
    );
  }
  return <MiniWindow variant={choice} />;
}

function MiniWindow({ variant }: { variant: 'dark' | 'light' }) {
  const palette =
    variant === 'dark'
      ? { shell: 'bg-[#0f1114]', side: 'bg-[#16191d]', line: 'bg-[#2a2f36]' }
      : { shell: 'bg-[#f4f5f6]', side: 'bg-[#eeeff1]', line: 'bg-[#d9dce0]' };
  return (
    <span className={cn('absolute inset-0 flex', palette.shell)}>
      <span className={cn('w-1/3 shrink-0', palette.side)} />
      <span className="flex flex-1 flex-col gap-1 p-1.5">
        <span className={cn('h-1 w-3/4 rounded-full', palette.line)} />
        <span className={cn('h-1 w-1/2 rounded-full', palette.line)} />
        <span className="mt-auto h-1 w-2/3 rounded-full bg-live/80" />
      </span>
    </span>
  );
}
