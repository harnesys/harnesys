import type { KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { FileTypeIcon, FolderTypeIcon } from '@/shared/ui/icons';
export function InlineCreateInput({
  kind,
  onFinish,
  depth,
  initialValue = '',
}: {
  kind: 'file' | 'dir';
  onFinish: (name: string) => void;
  depth: number;
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      onFinish(value);
    } else if (event.key === 'Escape') {
      onFinish('');
    }
  };
  return (
    <div
      className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm"
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
    >
      {kind === 'dir' ? <FolderTypeIcon size="md" /> : <FileTypeIcon name={value} size="md" />}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => onFinish(value)}
        placeholder={kind === 'dir' ? 'Folder name...' : 'File name...'}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
