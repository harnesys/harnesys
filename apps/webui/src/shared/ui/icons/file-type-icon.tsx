import { useId } from 'react';
import { iconGlyphColor, iconGlyphFontSize, iconStyleForFile } from '@/shared/lib/file-icon-styles';
import { cn } from '@/shared/lib/utils';
import { ICON_SIZE_CLASSES, type IconSize } from './sizes';

const BODY_PATH =
  'M7.5 2.6 H12.9 L18.8 8.5 V19.3 C18.8 20.46 17.86 21.4 16.7 21.4 H7.5 C6.34 21.4 5.4 20.46 5.4 19.3 V4.7 C5.4 3.54 6.34 2.6 7.5 2.6 Z';
const FOLD_PATH = 'M12.9 2.6 V6.3 C12.9 7.51 13.88 8.5 15.1 8.5 H18.8 Z';

export function FileTypeIcon({
  name,
  mediaType,
  className,
  size = 'sm',
}: {
  name: string;
  mediaType?: string | null;
  className?: string;
  size?: IconSize;
}) {
  const uid = useId().replaceAll(':', '');
  const style = iconStyleForFile(name, mediaType);
  const paperId = `file-type-icon-paper-${uid}`;
  const paperShadeId = `file-type-icon-shade-${uid}`;
  const blurId = `file-type-icon-blur-${uid}`;
  const fontSize = style.text ? iconGlyphFontSize(style.text) : 0;
  const glyphColor = iconGlyphColor(style);
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('shrink-0', ICON_SIZE_CLASSES[size], className)}
      role="img"
      aria-label={`${name} file`}
    >
      <defs>
        <linearGradient id={paperId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={style.from} />
          <stop offset="0.55" stopColor={style.to} />
          <stop offset="1" stopColor={style.to} />
        </linearGradient>
        <linearGradient id={paperShadeId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.18" />
        </linearGradient>
        <filter id={blurId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.45" />
        </filter>
      </defs>
      <g transform="translate(-3.447 -3.319) scale(1.2766)">
        <path d={BODY_PATH} fill={`url(#${paperId})`} />
        <path d={BODY_PATH} fill={`url(#${paperShadeId})`} />
        <path
          d="M12.9 3.2 V6.3 C12.9 7.51 13.88 8.5 15.1 8.5 H18.2 Z"
          fill="#0a0a0c"
          opacity="0.35"
          filter={`url(#${blurId})`}
        />
        <path d={FOLD_PATH} fill="#ffffff" opacity="0.32" />
        {style.glyph === 'text' ? (
          <text
            x="12.1"
            y="14"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={fontSize}
            fontWeight="800"
            letterSpacing="0.2"
            fill={glyphColor}
            fillOpacity="0.95"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            {style.text}
          </text>
        ) : null}
        {style.glyph === 'doc' ? (
          <g fill={glyphColor} fillOpacity="0.92">
            <rect x="8.3" y="11.4" width="7.6" height="1.35" rx="0.67" />
            <rect x="8.3" y="13.7" width="7.6" height="1.35" rx="0.67" />
            <rect x="8.3" y="16" width="4.9" height="1.35" rx="0.67" />
          </g>
        ) : null}
        {style.glyph === 'image' ? (
          <g
            fill="none"
            stroke={glyphColor}
            strokeOpacity="0.92"
            strokeWidth="0.9"
            strokeLinejoin="round"
            strokeLinecap="round"
          >
            <rect x="8" y="11" width="8.2" height="6.4" rx="1" />
            <path d="M8.9 16.6 L11.5 14.1 L13.3 15.9 L14.8 14.4 L16.2 15.8" />
          </g>
        ) : null}
        {style.glyph === 'image' ? (
          <circle cx="13.7" cy="12.9" r="0.85" fill={glyphColor} fillOpacity="0.92" />
        ) : null}
      </g>
    </svg>
  );
}
