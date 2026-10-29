export function PreviewHint({ text }: { text: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 text-muted-foreground text-sm">
      {text}
    </div>
  );
}
