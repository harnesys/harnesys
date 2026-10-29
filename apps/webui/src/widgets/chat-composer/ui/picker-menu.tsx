import { useEffect, useRef, useState } from 'react';
import { pickerItems } from '../model/composer-providers';
import type { SkillOption } from '../model/skill-source';
export interface PickerAnchor {
  left: number;
  bottom: number;
}
export interface SkillPickerProps {
  options: SkillOption[];
  loading: boolean;
  anchor: PickerAnchor;
  onPick(option: SkillOption): void;
  onClose(): void;
  onEsc(): void;
}
interface PickerState {
  items: SkillOption[];
  safeActive: number;
  query: string;
  onPick(option: SkillOption): void;
  onClose(): void;
  onEsc(): void;
}
type SetActive = (update: number | ((index: number) => number)) => void;
type SetQuery = (update: (value: string) => string) => void;
function handleArrow(event: KeyboardEvent, state: PickerState, setActive: SetActive): boolean {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
    return false;
  }
  if (state.items.length === 0) {
    return false;
  }
  consume(event);
  const step = event.key === 'ArrowDown' ? 1 : state.items.length - 1;
  setActive((index) => (index + step) % state.items.length);
  return true;
}
function handleEnter(event: KeyboardEvent, state: PickerState): void {
  if (event.key !== 'Enter' || event.shiftKey) {
    return;
  }
  consume(event);
  const picked = state.items[state.safeActive] ?? state.items[0];
  if (picked) {
    state.onPick(picked);
  }
}
function handleBackspace(
  event: KeyboardEvent,
  state: PickerState,
  setQuery: SetQuery,
  setActive: SetActive,
): void {
  if (event.key !== 'Backspace') {
    return;
  }
  consume(event);
  if (state.query.length > 0) {
    setQuery((value) => value.slice(0, -1));
    setActive(0);
  } else {
    state.onClose();
  }
}
function handleCharKey(event: KeyboardEvent, setQuery: SetQuery, setActive: SetActive): void {
  if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }
  consume(event);
  const char = event.key;
  setQuery((value) => value + char);
  setActive(0);
}
function handlePickerKey(
  event: KeyboardEvent,
  state: PickerState,
  setActive: SetActive,
  setQuery: SetQuery,
): void {
  if (event.isComposing || event.defaultPrevented) {
    return;
  }
  if (event.key === 'Escape') {
    consume(event);
    state.onEsc();
    return;
  }
  if (handleArrow(event, state, setActive)) {
    return;
  }
  handleEnter(event, state);
  if (event.defaultPrevented) {
    return;
  }
  handleBackspace(event, state, setQuery, setActive);
  if (event.defaultPrevented) {
    return;
  }
  handleCharKey(event, setQuery, setActive);
}
export function SkillPicker({
  options,
  loading,
  anchor,
  onPick,
  onClose,
  onEsc,
}: SkillPickerProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const items = pickerItems(query, options);
  const safeActive = active < items.length ? active : 0;
  const latest = useRef({ items, safeActive, query, onPick, onClose, onEsc });
  latest.current = { items, safeActive, query, onPick, onClose, onEsc };
  const listRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, []);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      handlePickerKey(event, latest.current, setActive, setQuery);
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
  const emptyLine = emptyStateLine(options.length, loading, query);
  return (
    <div
      className="z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-md"
      data-testid="skill-picker"
      role="dialog"
      aria-label="Attach a skill"
      style={{ position: 'fixed', left: anchor.left, bottom: anchor.bottom }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <ul ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
        {items.map((option, index) => {
          const isActive = index === safeActive;
          return (
            <li key={option.name}>
              <button
                type="button"
                data-active={isActive}
                className={`flex w-full items-start gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60'}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => onPick(option)}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium font-mono text-xs">{option.name}</span>
                  <span className="line-clamp-2 text-muted-foreground text-xs">
                    {option.description}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
        {items.length === 0 ? (
          <li className="px-3 py-2 text-muted-foreground text-xs">{emptyLine}</li>
        ) : null}
      </ul>
    </div>
  );
}
function consume(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopPropagation();
}
function emptyStateLine(optionCount: number, loading: boolean, query: string): string {
  if (optionCount > 0) {
    return `No skills match "${query}"`;
  }
  if (loading) {
    return 'Loading skills…';
  }
  return 'The agent has no available skills';
}
