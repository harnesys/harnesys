import { BOARD_TEMPLATES, type BoardTemplateKey } from '@harnesys/contracts';
import { ArrowRightIcon } from 'lucide-react';
import { softTint } from '@/shared/lib/color';
import { type DialogComponentProps, dialog } from '@/shared/services/overlay';
import { resolveBoardIcon } from '../model/board-icons';

const TEMPLATE_KEYS = Object.keys(BOARD_TEMPLATES) as BoardTemplateKey[];

export type BoardPresetResult = BoardTemplateKey;

export function openBoardPresetDialog(orgId: string) {
  return dialog.open(BoardPresetDialog, {
    title: 'New board',
    description: 'Pick a starting workflow. Next you name the board and set up its columns.',
    data: { orgId },
    className: 'sm:max-w-xl',
  });
}

export function BoardPresetDialog({ onResolve }: DialogComponentProps<BoardPresetResult>) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid grid-cols-2 gap-2.5">
        {TEMPLATE_KEYS.map((key) => (
          <PresetCard key={key} templateKey={key} onPick={() => onResolve?.(key)} />
        ))}
      </div>
    </div>
  );
}

function PresetCard({
  templateKey,
  onPick,
}: {
  templateKey: BoardTemplateKey;
  onPick: () => void;
}) {
  const card = BOARD_TEMPLATES[templateKey];
  const Icon = resolveBoardIcon(card.icon);
  const color = card.color ?? FALLBACK_BOARD_COLOR;
  return (
    <button
      type="button"
      className="group flex flex-col gap-2.5 rounded-xl border bg-popover p-3.5 text-left outline-none transition-all hover:border-foreground/20 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/50"
      data-testid={`board-template-${templateKey}`}
      onClick={onPick}
    >
      <span className="flex items-center gap-2.5">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: softTint(color), color }}
        >
          <Icon className="size-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-sm">{card.name}</span>
          <span className="block text-[11px] text-muted-foreground">
            {card.statuses.length} columns
          </span>
        </span>
        <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
      <span className="text-muted-foreground text-xs">{card.description}</span>
      <span className="mt-auto flex flex-wrap gap-1">
        {card.statuses.map((status) => (
          <span
            key={status.key}
            className="flex items-center gap-1 rounded border px-1.5 py-0 text-[10px] text-muted-foreground"
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: status.color }} />
            {status.label}
          </span>
        ))}
      </span>
    </button>
  );
}

const FALLBACK_BOARD_COLOR = '#64748b';
