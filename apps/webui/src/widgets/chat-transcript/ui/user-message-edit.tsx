import type { ThreadAttachment } from '@harnesys/studio-shared';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Textarea } from '@/shared/ui/textarea';

export interface SendInput {
  attachments?: {
    id: string;
    kind: 'image' | 'audio' | 'video' | 'file';
    name: string;
    mediaType: string;
    path: string;
  }[];
  skills?: string[];
}

export function buildSendInput(
  atts: ThreadAttachment[] | undefined,
  skills: string[] | undefined,
): SendInput {
  const attachments = atts?.length
    ? {
        attachments: atts.map((item) => ({
          id: item.id,
          kind: item.kind as 'image' | 'audio' | 'video' | 'file',
          name: item.name,
          mediaType: item.mediaType,
          path: item.path,
        })),
      }
    : {};
  const attachedSkills = skills?.length ? { skills } : {};
  return { ...attachments, ...attachedSkills };
}

export function UserMessageEditor({
  initialText,
  onCancel,
  onSave,
}: {
  initialText: string;
  onCancel: () => void;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState(initialText);
  const trimmed = text.trim();
  return (
    <div className="flex w-full max-w-[80%] flex-col gap-2">
      <Textarea
        value={text}
        autoFocus
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onCancel();
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && trimmed) {
            onSave(trimmed);
          }
        }}
        className="min-h-20 rounded-2xl bg-secondary text-secondary-foreground"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!trimmed || trimmed === initialText.trim()}
          onClick={() => onSave(trimmed)}
        >
          Save & retry
        </Button>
      </div>
    </div>
  );
}
