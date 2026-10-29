import { PencilIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import {
  type Agent,
  agentStarters,
  loadStoredAgentBullets,
  writeAgentBullets,
} from '@/entities/agent';
import { sendMessage } from '@/features/send-message';
import { Button } from '@/shared/ui/button';
import { CategoryLandingSectionLabel } from '@/shared/ui/category-landing';

export function AgentBulletList({ agent, threadId }: { agent: Agent; threadId: string }) {
  const [bullets, setBullets] = useState<string[]>(() => {
    return loadStoredAgentBullets(agent) ?? agentStarters(agent);
  });
  const [editIndex, setEditIndex] = useState<number | null>(null);
  if (bullets.length === 0) {
    return null;
  }
  return (
    <section>
      <CategoryLandingSectionLabel>Start with</CategoryLandingSectionLabel>
      <div className="flex flex-col gap-1.5">
        {bullets.map((bullet, index) =>
          index === editIndex ? (
            <BulletEditor
              key={bullet}
              initialText={bullet}
              onCommit={(next) => {
                setEditIndex(null);
                const text = next.trim();
                if (text === bullet) {
                  return;
                }
                setBullets(
                  writeAgentBullets(
                    agent,
                    text
                      ? bullets.map((item, i) => (i === index ? text : item))
                      : bullets.filter((_, i) => i !== index),
                  ),
                );
              }}
              onCancel={() => {
                setEditIndex(null);
              }}
            />
          ) : (
            <div
              key={bullet}
              className="group/bullet relative w-full rounded-lg border border-transparent bg-background/45 backdrop-blur-[1px] transition-colors focus-within:border-live/30 hover:border-border/70 hover:bg-background/70"
            >
              <button
                type="button"
                onClick={() => {
                  void sendMessage({ threadId, content: bullet });
                }}
                className="w-full px-3 py-2.5 pr-14 text-left text-sm leading-snug"
              >
                {bullet}
              </button>
              <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 gap-0.5 opacity-0 transition-opacity group-focus-within/bullet:opacity-100 group-hover/bullet:opacity-100">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground hover:bg-transparent hover:text-foreground"
                  onClick={() => {
                    setEditIndex(index);
                  }}
                  aria-label="Edit bullet"
                  title="Edit bullet"
                >
                  <PencilIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground hover:bg-transparent hover:text-foreground"
                  onClick={() => {
                    setBullets(
                      writeAgentBullets(
                        agent,
                        bullets.filter((_, i) => i !== index),
                      ),
                    );
                  }}
                  aria-label="Remove bullet"
                  title="Remove bullet"
                >
                  <XIcon />
                </Button>
              </div>
            </div>
          ),
        )}
      </div>
    </section>
  );
}

function BulletEditor({
  initialText,
  onCommit,
  onCancel,
}: {
  initialText: string;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initialText);
  return (
    <input
      ref={(el) => {
        el?.focus();
      }}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          onCommit(draft);
        }
        if (event.key === 'Escape') {
          onCancel();
        }
      }}
      onBlur={() => {
        onCommit(draft);
      }}
      className="w-full rounded-lg border border-live/40 bg-background/70 px-3 py-2.5 text-sm leading-snug outline-none focus-visible:ring-2 focus-visible:ring-live/20"
    />
  );
}
