import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { ReactRenderer } from '@tiptap/react';
import {
  exitSuggestion,
  Suggestion,
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from '@tiptap/suggestion';
import { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import type { MentionOption } from '../model/mention-source';

export {
  filterMentions,
  type MentionKind,
  type MentionOption,
} from '../model/mention-source';
export { mentionSuggestionKey };

const mentionSuggestionKey = new PluginKey('composer-mention');

export function exitMentionSuggestion(view: EditorView): void {
  exitSuggestion(view, mentionSuggestionKey);
}

export interface MentionSuggestionOptions {
  isDisabled(): boolean;
  getItems(query: string): MentionOption[];
}

export function createMentionSuggestion(options: MentionSuggestionOptions) {
  return Extension.create({
    name: 'composer-mention-suggestion',
    addProseMirrorPlugins() {
      return [
        Suggestion<MentionOption, MentionOption>({
          pluginKey: mentionSuggestionKey,
          editor: this.editor,
          char: '@',
          allowedPrefixes: null,
          placement: 'top-start',
          offset: { mainAxis: 8 },
          floatingUi: { strategy: 'fixed' },
          allow: () => !options.isDisabled(),
          shouldShow: ({ query }) => !options.isDisabled() && options.getItems(query).length > 0,
          items: ({ query }) => options.getItems(query),
          command: ({ editor, range, props }) => {
            editor.chain().focus().deleteRange(range).insertContent(`@${props.handle} `).run();
          },
          render: () => createMentionMenuRenderer(),
        }),
      ];
    },
  });
}

export interface MentionSuggestionMenuHandle {
  onKeyDown(event: KeyboardEvent): boolean;
}

export interface MentionSuggestionMenuProps {
  items: MentionOption[];
  onSelect(option: MentionOption): void;
}

function createMentionMenuRenderer() {
  let component: ReactRenderer<MentionSuggestionMenuHandle, MentionSuggestionMenuProps> | null =
    null;
  let unmount: (() => void) | null = null;
  const destroy = () => {
    unmount?.();
    component?.destroy();
    component = null;
    unmount = null;
  };
  return {
    onStart: (props: SuggestionProps<MentionOption, MentionOption>) => {
      destroy();
      component = new ReactRenderer(MentionSuggestionMenu, {
        editor: props.editor,
        props: { items: props.items, onSelect: props.command },
        className: 'z-50',
      });
      unmount = props.mount(component.element);
    },
    onUpdate: (props: SuggestionProps<MentionOption, MentionOption>) => {
      component?.updateProps({ items: props.items, onSelect: props.command });
    },
    onKeyDown: (props: SuggestionKeyDownProps) => component?.ref?.onKeyDown(props.event) ?? false,
    onExit: destroy,
  };
}

export const MentionSuggestionMenu = forwardRef<
  MentionSuggestionMenuHandle,
  MentionSuggestionMenuProps
>(function MentionSuggestionMenu({ items, onSelect }, ref) {
  const [active, setActive] = useState(0);
  const safeActive = active < items.length ? active : 0;
  const scrollActiveIntoView = useCallback((node: HTMLLIElement | null) => {
    node?.scrollIntoView({ block: 'nearest' });
  }, []);
  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: (event) =>
        handleMenuKeyDown(event, { items, active: safeActive, onSelect, setActive }),
    }),
    [items, safeActive, onSelect],
  );
  return (
    <div
      className="w-64 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-md"
      data-testid="mention-suggestion-menu"
    >
      <ul className="max-h-56 overflow-y-auto py-1">
        {items.map((option, index) => {
          const isActive = index === safeActive;
          return (
            <li
              key={`${option.kind}:${option.id}`}
              ref={isActive ? scrollActiveIntoView : undefined}
            >
              <button
                type="button"
                className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm ${isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60'}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => onSelect(option)}
              >
                <span className="truncate">{option.label}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                  @{option.handle}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
});

interface MenuKeydownState {
  items: MentionOption[];
  active: number;
  onSelect(option: MentionOption): void;
  setActive(update: (index: number) => number): void;
}

function handleMenuKeyDown(event: KeyboardEvent, state: MenuKeydownState): boolean {
  const { items, active, onSelect, setActive } = state;
  if (event.isComposing) {
    return false;
  }
  if (event.key === 'ArrowDown' && items.length > 0) {
    setActive((index) => (index + 1) % items.length);
    return true;
  }
  if (event.key === 'ArrowUp' && items.length > 0) {
    setActive((index) => (index - 1 + items.length) % items.length);
    return true;
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    const picked = items[active] ?? items[0];
    if (picked) {
      onSelect(picked);
    }
    return true;
  }
  return false;
}
