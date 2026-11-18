import type { ReactNode } from 'react';

interface FindPlaceholderProps {
  icon: ReactNode;
  text: string;
}

export function FindPlaceholder({ icon, text }: FindPlaceholderProps) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-center text-muted-foreground text-xs"
      data-testid="find-in-files-placeholder"
    >
      <span className="opacity-60 [&>svg]:size-5">{icon}</span>
      <span className="max-w-72">{text}</span>
    </div>
  );
}
