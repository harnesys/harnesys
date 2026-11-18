import type { WidgetRefresh, WidgetRefreshMode, WidgetSource } from '@harnesys/contracts';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

const BASE_MODES: Array<{ mode: WidgetRefreshMode; label: string }> = [
  { mode: 'onMount', label: 'On mount' },
  { mode: 'manual', label: 'Manual' },
  { mode: 'onEvent', label: 'On event' },
];

interface RefreshFieldsProps {
  source: WidgetSource;
  onPatch: (next: Partial<WidgetSource>) => void;
}

/** Refresh mode row of a source card: mount, manual, interval, org event topics. */
export function RefreshFields({ source, onPatch }: RefreshFieldsProps): React.ReactNode {
  const refresh = source.refresh;
  const mode = refresh?.mode ?? 'onMount';
  const modes =
    source.kind === 'external'
      ? [...BASE_MODES, { mode: 'interval' as const, label: 'Interval' }]
      : BASE_MODES;

  const patchRefresh = (next: WidgetRefresh): void => {
    onPatch({ refresh: next });
  };

  const pickMode = (next: string): void => {
    if (next === 'interval') {
      patchRefresh({ mode: 'interval', intervalSeconds: refresh?.intervalSeconds ?? 60 });
      return;
    }
    if (next === 'onEvent') {
      patchRefresh({ mode: 'onEvent', topics: refresh?.topics ?? [] });
      return;
    }
    if (next === 'manual' || next === 'onMount') {
      patchRefresh({ mode: next });
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Select value={mode} onValueChange={(next) => next && pickMode(next)}>
          <SelectTrigger size="sm" className="w-32" aria-label="Refresh mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {modes.map((option) => (
              <SelectItem key={option.mode} value={option.mode}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {mode === 'interval' ? (
          <Input
            type="number"
            min={30}
            max={3600}
            value={refresh?.intervalSeconds ?? 60}
            onChange={(event) =>
              patchRefresh({
                mode: 'interval',
                intervalSeconds: Math.max(30, Number(event.target.value) || 30),
              })
            }
            className="h-7 w-24"
            aria-label="Interval seconds"
          />
        ) : null}
      </div>
      {mode === 'onEvent' ? (
        <Input
          value={(refresh?.topics ?? []).join(', ')}
          placeholder="Topics: approvals.changed, threads.created"
          onChange={(event) =>
            patchRefresh({
              mode: 'onEvent',
              topics: event.target.value
                .split(',')
                .map((topic) => topic.trim())
                .filter(Boolean),
            })
          }
          className="h-7 font-mono text-[11px]"
          aria-label="Event topics"
        />
      ) : null}
    </div>
  );
}
