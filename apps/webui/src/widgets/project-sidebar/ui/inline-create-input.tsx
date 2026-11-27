import type { KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { FileTypeIcon, FolderTypeIcon } from '@/shared/ui/icons';
import { SIDEBAR_FILE_ROW_HEIGHT, SIDEBAR_ROW_INDENT } from '@/shared/ui/sidebar-row';
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
      className="flex items-center gap-1.5 rounded-md pr-1.5"
      style={{
        paddingLeft: `${depth * SIDEBAR_ROW_INDENT + 6}px`,
        height: SIDEBAR_FILE_ROW_HEIGHT,
      }}
    >
      <span className="flex size-4 shrink-0 items-center justify-center" />
      <span className="flex size-[18px] shrink-0 items-center justify-center">
        {kind === 'dir' ? <FolderTypeIcon size="md" /> : <FileTypeIcon name={value} size="md" />}
      </span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => onFinish(value)}
        placeholder={kind === 'dir' ? 'Folder name...' : 'File name...'}
        className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
