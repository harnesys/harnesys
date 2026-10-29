import {
  AUTO_SAVE_DELAYS,
  AUTO_SAVE_MODE_LABELS,
  AUTO_SAVE_MODES,
  DEFAULT_EDITOR_PREFERENCES,
  EDITOR_FONT_SIZES,
  EDITOR_TAB_SIZES,
  isDefaultEditorPreferences,
  RENDER_WHITESPACE_LABELS,
  RENDER_WHITESPACE_MODES,
  useEditorPreferences,
} from '@/shared/lib/editor-preferences';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { SettingsField, SettingsSection, SettingsToggle } from '@/shared/ui/settings-kit';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

const AUTO_SAVE_DELAY_LABELS: Record<number, string> = {
  500: '0.5 s',
  1000: '1 s',
  2000: '2 s',
  5000: '5 s',
};

export function EditorSettingsPane() {
  const prefs = useEditorPreferences();
  const { setPreference, resetEditorPreferences } = prefs;
  return (
    <div className="flex w-full flex-col gap-8" data-testid="editor-settings-pane">
      <SettingsSection
        label="Font"
        description="Typeface for file editors on this machine."
        actions={
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={isDefaultEditorPreferences(prefs)}
            onClick={resetEditorPreferences}
            data-testid="editor-preferences-reset"
          >
            Reset to defaults
          </Button>
        }
      >
        <SettingsField
          label="Font size"
          description="Editor text size in pixels."
          htmlFor="editor-font-size"
        >
          <Select
            value={String(prefs.fontSize)}
            onValueChange={(next) => setPreference('fontSize', Number(next))}
          >
            <SelectTrigger
              id="editor-font-size"
              className="w-full"
              size="sm"
              data-testid="editor-font-size"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {EDITOR_FONT_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} px
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingsField>
        <SettingsField
          label="Font family"
          description="CSS font stack, falls back to the default when cleared."
          htmlFor="editor-font-family"
        >
          <Input
            id="editor-font-family"
            value={prefs.fontFamily}
            placeholder={DEFAULT_EDITOR_PREFERENCES.fontFamily}
            onChange={(event) =>
              setPreference(
                'fontFamily',
                event.target.value.trim() || DEFAULT_EDITOR_PREFERENCES.fontFamily,
              )
            }
            data-testid="editor-font-family"
          />
        </SettingsField>
        <SettingsToggle
          id="editor-font-ligatures"
          label="Font ligatures"
          description="Render programming ligatures supported by the font."
          checked={prefs.fontLigatures}
          onCheckedChange={(checked) => setPreference('fontLigatures', checked)}
          testId="editor-font-ligatures"
        />
      </SettingsSection>

      <SettingsSection label="Indentation" description="Tab and space behavior for editors.">
        <SettingsField
          label="Tab size"
          description="Width of the tab character in spaces."
          htmlFor="editor-tab-size"
        >
          <Select
            value={String(prefs.tabSize)}
            onValueChange={(next) => setPreference('tabSize', Number(next))}
          >
            <SelectTrigger
              id="editor-tab-size"
              className="w-full"
              size="sm"
              data-testid="editor-tab-size"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {EDITOR_TAB_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingsField>
        <SettingsToggle
          id="editor-insert-spaces"
          label="Insert spaces"
          description="Insert spaces when Tab is pressed instead of the tab character."
          checked={prefs.insertSpaces}
          onCheckedChange={(checked) => setPreference('insertSpaces', checked)}
          testId="editor-insert-spaces"
        />
        <SettingsToggle
          id="editor-detect-indentation"
          label="Detect indentation"
          description="Infer tab size and spaces from file content when a file opens, overriding the values above."
          checked={prefs.detectIndentation}
          onCheckedChange={(checked) => setPreference('detectIndentation', checked)}
          testId="editor-detect-indentation"
        />
      </SettingsSection>

      <SettingsSection label="Display" description="What the editor renders around the code.">
        <SettingsToggle
          id="editor-word-wrap"
          label="Word wrap"
          description="Wrap long lines instead of horizontal scrolling."
          checked={prefs.wordWrap}
          onCheckedChange={(checked) => setPreference('wordWrap', checked)}
          testId="editor-word-wrap"
        />
        <SettingsToggle
          id="editor-line-numbers"
          label="Line numbers"
          description="Show the line number gutter."
          checked={prefs.lineNumbers}
          onCheckedChange={(checked) => setPreference('lineNumbers', checked)}
          testId="editor-line-numbers"
        />
        <SettingsToggle
          id="editor-minimap"
          label="Minimap"
          description="Show the code overview minimap on the right."
          checked={prefs.minimap}
          onCheckedChange={(checked) => setPreference('minimap', checked)}
          testId="editor-minimap"
        />
        <SettingsToggle
          id="editor-sticky-scroll"
          label="Sticky scroll"
          description="Keep parent scopes pinned to the top while scrolling."
          checked={prefs.stickyScroll}
          onCheckedChange={(checked) => setPreference('stickyScroll', checked)}
          testId="editor-sticky-scroll"
        />
        <SettingsField
          label="Render whitespace"
          description="Which whitespace characters get a visible glyph."
        >
          <ToggleGroup
            aria-label="Render whitespace"
            variant="segment"
            value={[prefs.renderWhitespace]}
            data-testid="editor-render-whitespace"
            onValueChange={(value) => {
              const next = RENDER_WHITESPACE_MODES.find((mode) => mode === value[0]);
              if (next) {
                setPreference('renderWhitespace', next);
              }
            }}
          >
            {RENDER_WHITESPACE_MODES.map((mode) => (
              <ToggleGroupItem key={mode} value={mode}>
                {RENDER_WHITESPACE_LABELS[mode]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </SettingsField>
      </SettingsSection>

      <SettingsSection label="Saving" description="When the editor writes files to the server.">
        <SettingsField
          label="Auto save"
          description="Off keeps edits local until you press Cmd+S."
          htmlFor="editor-auto-save-mode"
        >
          <Select
            value={prefs.autoSaveMode}
            onValueChange={(next) => {
              const mode = AUTO_SAVE_MODES.find((item) => item === next);
              if (mode) {
                setPreference('autoSaveMode', mode);
              }
            }}
          >
            <SelectTrigger
              id="editor-auto-save-mode"
              className="w-full"
              size="sm"
              data-testid="editor-auto-save-mode"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {AUTO_SAVE_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {AUTO_SAVE_MODE_LABELS[mode]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingsField>
        {prefs.autoSaveMode === 'afterDelay' ? (
          <SettingsField
            label="Save delay"
            description="Idle time after typing before the file is written."
            htmlFor="editor-auto-save-delay"
          >
            <Select
              value={String(prefs.autoSaveDelayMs)}
              onValueChange={(next) => setPreference('autoSaveDelayMs', Number(next))}
            >
              <SelectTrigger
                id="editor-auto-save-delay"
                className="w-full"
                size="sm"
                data-testid="editor-auto-save-delay"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {AUTO_SAVE_DELAYS.map((delay) => (
                    <SelectItem key={delay} value={String(delay)}>
                      {AUTO_SAVE_DELAY_LABELS[delay]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </SettingsField>
        ) : null}
      </SettingsSection>
    </div>
  );
}
