import type { Thread } from '@/entities/thread';
import type { ComposerMode, ComposerModeItem } from '../model/composer-mode';
import type { AttachKind } from '../model/model-input';
import { AttachMenu } from './attach-menu';
import { ComposerThreadMenu } from './composer-thread-menu';
import { ModeSelect } from './mode-select';

export function ComposerStartControls({
  thread,
  allowed,
  disabled,
  modeItems,
  mode,
  onModeChange,
  onPick,
  assistant,
}: {
  thread: Thread;
  allowed: AttachKind[];
  disabled: boolean;
  modeItems: ComposerModeItem[];
  mode: ComposerMode;
  onModeChange: (mode: ComposerMode) => void;
  onPick: (files: File[]) => void;
  assistant: boolean;
}) {
  return (
    <>
      {assistant ? null : <ComposerThreadMenu thread={thread} />}
      <AttachMenu allowed={allowed} disabled={disabled} onPick={onPick} />
      {assistant ? null : (
        <ModeSelect modes={modeItems} value={mode} disabled={disabled} onChange={onModeChange} />
      )}
    </>
  );
}
