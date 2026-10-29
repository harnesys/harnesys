import {
  CHAT_FONT_SIZE_LABELS,
  CHAT_FONT_SIZES,
  FEED_DETAIL_LABELS,
  FEED_DETAIL_MODES,
  isChatFontSize,
  useChatPreferences,
} from '@/shared/lib/chat-preferences';
import { SettingsField, SettingsSection, SettingsToggle } from '@/shared/ui/settings-kit';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';
import { AudioSettingsSection } from './audio-settings-section';

export function ChatSettingsPane() {
  const {
    detailedStats,
    setDetailedStats,
    chatFontSize,
    setChatFontSize,
    feedDetail,
    setFeedDetail,
  } = useChatPreferences();
  return (
    <div className="flex w-full flex-col gap-8" data-testid="chat-settings-pane">
      <SettingsSection label="Messages" description="How the agent chat renders on this machine.">
        <SettingsField
          label="Font size"
          description="Text size for agent and user messages."
          htmlFor="chat-font-select"
        >
          <ToggleGroup
            aria-label="Font size"
            variant="segment"
            value={[chatFontSize]}
            data-testid="chat-font-select"
            onValueChange={(value) => {
              const next = value[0];
              if (next && isChatFontSize(next)) {
                setChatFontSize(next);
              }
            }}
          >
            {CHAT_FONT_SIZES.map((item) => (
              <ToggleGroupItem key={item} value={item}>
                {CHAT_FONT_SIZE_LABELS[item]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </SettingsField>
        <SettingsField
          label="Feed detail"
          description="Manual expands blocks on click only; Quiet follows the active block; Full keeps everything open."
        >
          <ToggleGroup
            aria-label="Feed detail"
            variant="segment"
            value={[feedDetail]}
            onValueChange={(value) => {
              const next = FEED_DETAIL_MODES.find((mode) => mode === value[0]);
              if (next) {
                setFeedDetail(next);
              }
            }}
          >
            {FEED_DETAIL_MODES.map((item) => (
              <ToggleGroupItem key={item} value={item}>
                {FEED_DETAIL_LABELS[item]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </SettingsField>
      </SettingsSection>

      <SettingsSection label="Display & Metrics">
        <SettingsToggle
          id="detailed-stats"
          label="Detailed statistics"
          description="Show token counts, cache, reasoning, duration, and cost per model generation and turn."
          checked={detailedStats}
          onCheckedChange={setDetailedStats}
        />
      </SettingsSection>

      <AudioSettingsSection />
    </div>
  );
}
