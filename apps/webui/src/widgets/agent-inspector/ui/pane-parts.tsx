import { FolderTypeIcon } from '@/shared/ui/icons';

export function SectionLabel({ children }: { children: string }) {
  return (
    <div className="font-medium text-[10px] text-muted-foreground/70 uppercase tracking-wider">
      {children}
    </div>
  );
}

export function PaneHint({ text }: { text: string }) {
  return <div className="text-muted-foreground/70 text-xs">{text}</div>;
}

export function EntryIcon({ open }: { open: boolean }) {
  return <FolderTypeIcon open={open} size="xl" />;
}
