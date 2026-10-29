import './composer-editor.css';
import { Extension } from '@tiptap/core';
import { Document } from '@tiptap/extension-document';
import { HardBreak } from '@tiptap/extension-hard-break';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import { Placeholder, UndoRedo } from '@tiptap/extensions';
import { Plugin } from '@tiptap/pm/state';
import { EditorContent, useEditor } from '@tiptap/react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { parseFileRefDrag } from '@/shared/lib/file-ref-drag';
import { type ComposerPayload, serializeComposerDoc } from '../model/composer-doc';
import { fileItems } from '../model/composer-providers';
import { isValidEntityRef } from '../model/entity-kinds';
import type { FileOption } from '../model/file-source';
import { $insertInlineEntity, InlineEntityNode } from '../model/inline-entity-node';
import { type SkillOption, useComposerSkillOptions } from '../model/skill-source';
import type { SlashCommand } from '../model/slash-commands';
import {
  createFileSuggestion,
  exitFileSuggestion,
  type FileChipInput,
  fileSuggestionKey,
  insertFileChips,
} from './file-suggestion-menu';
import { type PickerAnchor, SkillPicker } from './picker-menu';
import { createSlashSuggestion, exitSlashSuggestion, slashSuggestionKey } from './suggestion-menu';
export interface ComposerEditorHandle {
  getPayload(): ComposerPayload;
  clear(): void;
  focus(): void;
  insertFileMention(ref: string, href?: string): void;
  insertPlainText(text: string): void;
  posAtPoint(x: number, y: number): number | null;
  insertFileLinks(links: FileChipInput[], at?: number | null): void;
}
export interface ComposerEditorProps {
  placeholder: string;
  disabled: boolean;
  fileOptions: FileOption[];
  onChange(payload: ComposerPayload): void;
  onSubmit(): void;
  onSlashCommand(command: SlashCommand): void;
  shouldConsumePaste(data: DataTransfer): boolean;
}
const EDITOR_CLASS = 'tiptap w-full px-3 py-3 text-[15px] leading-6 min-h-14 outline-none';
const PICKER_WIDTH = 320;
export const ComposerEditor = forwardRef<ComposerEditorHandle, ComposerEditorProps>(
  function ComposerEditor(props, ref) {
    const latest = useRef(props);
    latest.current = props;
    const placeholderRef = useRef(props.placeholder);
    const [picker, setPicker] = useState<PickerAnchor | null>(null);
    const pickerAt = useRef(0);
    const pickerToken = useRef('');
    const skills = useComposerSkillOptions();
    const closePicker = useCallback(() => setPicker(null), []);
    const extensions = useMemo(() => {
      const submitKeymap = Extension.create({
        name: 'composer-submit-keymap',
        priority: 200,
        addProseMirrorPlugins() {
          return [
            new Plugin({
              props: {
                handleKeyDown(view, event) {
                  if (
                    event.key !== 'Enter' ||
                    event.isComposing ||
                    event.defaultPrevented ||
                    latest.current.disabled
                  ) {
                    return false;
                  }
                  if (event.shiftKey) {
                    return false;
                  }
                  if (
                    slashSuggestionKey.getState(view.state)?.active ||
                    fileSuggestionKey.getState(view.state)?.active
                  ) {
                    return false;
                  }
                  latest.current.onSubmit();
                  return true;
                },
                handlePaste(_view, event) {
                  return event.clipboardData
                    ? latest.current.shouldConsumePaste(event.clipboardData)
                    : false;
                },
                handleDrop(_view, event) {
                  const data = event.dataTransfer;
                  if (!data) {
                    return false;
                  }
                  if (data.types.includes('Files')) {
                    return true;
                  }
                  if (parseFileRefDrag(data)) {
                    event.preventDefault();
                    return true;
                  }
                  return false;
                },
              },
            }),
          ];
        },
      });
      return [
        Document,
        Paragraph,
        Text,
        HardBreak,
        InlineEntityNode,
        UndoRedo,
        Placeholder.configure({
          placeholder: () => placeholderRef.current,
          showOnlyWhenEditable: false,
        }),
        submitKeymap,
        createSlashSuggestion({
          isDisabled: () => latest.current.disabled,
          onExecute: (command) => latest.current.onSlashCommand(command),
          onPicker: (_command, at, editor, consumed) => {
            const box = editor.view.coordsAtPos(at);
            pickerAt.current = at;
            pickerToken.current = consumed;
            setPicker({
              left: Math.max(8, Math.min(box.left, window.innerWidth - PICKER_WIDTH - 8)),
              bottom: Math.max(8, window.innerHeight - box.top + 8),
            });
          },
        }),
        createFileSuggestion({
          isDisabled: () => latest.current.disabled,
          getItems: (query) => safeFileItems(query, latest.current.fileOptions),
        }),
      ];
    }, []);
    const editorProps = useMemo(
      () => ({
        attributes: {
          class: EDITOR_CLASS,
          'data-slot': 'input-group-control',
        },
      }),
      [],
    );
    const editor = useEditor({
      extensions,
      editable: !props.disabled,
      editorProps,
      onBlur: () => closePicker(),
      onUpdate: ({ editor }) => {
        latest.current.onChange(serializeComposerDoc(editor.state.doc));
      },
    });
    useEffect(() => {
      editor.setEditable(!props.disabled);
      if (props.disabled) {
        exitSlashSuggestion(editor.view);
        exitFileSuggestion(editor.view);
        closePicker();
      }
    }, [props.disabled, editor, closePicker]);
    useEffect(() => {
      placeholderRef.current = props.placeholder;
      editor.view.dispatch(editor.state.tr);
    }, [props.placeholder, editor]);
    const pickSkill = useCallback(
      (option: SkillOption) => {
        const at = pickerAt.current;
        $insertInlineEntity(editor, at, { kind: 'skill', ref: option.name, href: '' });
        editor
          .chain()
          .insertContentAt(at + 1, ' ')
          .focus()
          .run();
        closePicker();
      },
      [editor, closePicker],
    );
    const escPicker = useCallback(() => {
      const token = pickerToken.current;
      if (token) {
        editor.chain().focus().insertContentAt(pickerAt.current, token).run();
      }
      closePicker();
    }, [editor, closePicker]);
    const insertFileMention = useCallback(
      (mentionRef: string, href?: string) => {
        if (latest.current.disabled || !isValidEntityRef('file', mentionRef)) {
          return;
        }
        insertFileChips(editor, editor.state.selection.from, [{ ref: mentionRef, href }]);
      },
      [editor],
    );
    const posAtPoint = useCallback(
      (x: number, y: number): number | null => {
        const coords = editor.view.posAtCoords({ left: x, top: y });
        return coords ? coords.pos : null;
      },
      [editor],
    );
    const insertFileLinks = useCallback(
      (links: FileChipInput[], at?: number | null) => {
        if (latest.current.disabled || links.length === 0) {
          return;
        }
        insertFileChips(editor, at ?? editor.state.selection.from, links);
      },
      [editor],
    );
    const insertPlainText = useCallback(
      (text: string) => {
        editor.chain().focus().insertContent(text).run();
      },
      [editor],
    );
    useImperativeHandle(
      ref,
      () => ({
        getPayload: () => serializeComposerDoc(editor.state.doc),
        clear: () => editor.commands.clearContent(),
        focus: () => editor.commands.focus(),
        insertFileMention,
        insertPlainText,
        posAtPoint,
        insertFileLinks,
      }),
      [editor, insertFileMention, insertPlainText, posAtPoint, insertFileLinks],
    );
    return (
      <>
        <EditorContent
          editor={editor}
          className={props.disabled ? 'min-w-0 flex-1 opacity-50' : 'min-w-0 flex-1'}
        />
        {picker
          ? createPortal(
              <SkillPicker
                options={skills.options}
                loading={skills.loading}
                anchor={picker}
                onPick={pickSkill}
                onClose={closePicker}
                onEsc={escPicker}
              />,
              document.body,
            )
          : null}
      </>
    );
  },
);
function safeFileItems(query: string, options: FileOption[] | undefined): FileOption[] {
  try {
    return fileItems(query, options ?? []);
  } catch {
    return [];
  }
}
