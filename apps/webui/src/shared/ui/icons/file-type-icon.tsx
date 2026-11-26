import { useId } from 'react';
import { iconGlyphColor, iconGlyphFontSize, iconStyleForFile } from '@/shared/lib/file-icon-styles';
import { cn } from '@/shared/lib/utils';
import { ICON_SIZE_CLASSES, type IconSize } from './sizes';

const BODY_PATH =
  'M6.7 2.6 H13.7 L19.6 8.5 V19.3 C19.6 20.46 18.66 21.4 17.5 21.4 H6.7 C5.54 21.4 4.6 20.46 4.6 19.3 V4.7 C4.6 3.54 5.54 2.6 6.7 2.6 Z';
const FOLD_PATH = 'M13.7 2.6 V6.3 C13.7 7.51 14.68 8.5 15.9 8.5 H19.6 Z';

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
      <g transform="translate(-2.417 -2.298) scale(1.19149)">
        <path d={BODY_PATH} fill={`url(#${paperId})`} />
        <path d={BODY_PATH} fill={`url(#${paperShadeId})`} />
        <path
          d="M13.7 3.2 V6.3 C13.7 7.51 14.68 8.5 15.9 8.5 H19.0 Z"
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
            <rect x="8" y="11.4" width="8.2" height="1.35" rx="0.67" />
            <rect x="8" y="13.7" width="8.2" height="1.35" rx="0.67" />
            <rect x="8" y="16" width="5.3" height="1.35" rx="0.67" />
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
            <rect x="7.7" y="11" width="8.8" height="6.4" rx="1" />
            <path d="M8.5 16.6 L11.4 14.1 L13.3 15.9 L15 14.4 L16.5 15.8" />
          </g>
        ) : null}
        {style.glyph === 'image' ? (
          <circle cx="13.9" cy="12.9" r="0.85" fill={glyphColor} fillOpacity="0.92" />
        ) : null}
      </g>
    </svg>
  );
}
