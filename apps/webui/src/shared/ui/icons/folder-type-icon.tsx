import { useId } from 'react';
import { cn } from '@/shared/lib/utils';
import { ICON_SIZE_CLASSES, type IconSize } from './sizes';

const BACK_TAB =
  'M2.3 19 V6.4 C2.3 5.18 3.28 4.2 4.5 4.2 H8.7 C10.5 4.2 10.9 6.3 12.8 6.3 H19.5 C20.72 6.3 21.7 7.28 21.7 8.5 V19 Z';
const FRONT_BODY =
  'M2.3 10.2 C2.3 8.71 3.31 7.6 4.8 7.6 H19.2 C20.69 7.6 21.7 8.71 21.7 10.2 V17.8 C21.7 19.29 20.69 20.4 19.2 20.4 H4.8 C3.31 20.4 2.3 19.29 2.3 17.8 Z';
const OPEN_FRONT =
  'M3.2 9.4 H21.0 C21.85 9.4 22.3 10.05 22.3 11.2 V17.9 C22.3 19.29 21.18 20.4 19.8 20.4 H4.6 C3.22 20.4 2.1 19.29 2.1 17.9 V11.2 C2.1 10.05 2.35 9.4 3.2 9.4 Z';

export function FolderTypeIcon({
  open = false,
  className,
  size = 'sm',
}: {
  open?: boolean;
  className?: string;
  size?: IconSize;
}) {
  const uid = useId().replaceAll(':', '');
  const frontId = `folder-type-icon-front-${uid}`;
  const backId = `folder-type-icon-back-${uid}`;
  const blurId = `folder-type-icon-blur-${uid}`;
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('shrink-0', ICON_SIZE_CLASSES[size], className)}
      role="img"
      aria-label={open ? 'Open folder' : 'Folder'}
    >
      <defs>
        <linearGradient id={frontId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6e6e77" />
          <stop offset="0.08" stopColor="#64646c" />
          <stop offset="0.45" stopColor="#595961" />
          <stop offset="1" stopColor="#48484f" />
        </linearGradient>
        <linearGradient id={backId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4d4d54" />
          <stop offset="0.55" stopColor="#3b3b41" />
          <stop offset="1" stopColor="#2b2b30" />
        </linearGradient>
        <filter id={blurId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.55" />
        </filter>
      </defs>
      <g transform="translate(-2.495 -2.614) scale(1.1881)">
        <path d={BACK_TAB} fill={`url(#${backId})`} />
        {open ? (
          <>
            <path d={FRONT_BODY} fill="#2e2e34" />
            <rect
              x="3.4"
              y="8.65"
              width="17.4"
              height="0.9"
              rx="0.45"
              fill="#0a0a0c"
              opacity="0.32"
              filter={`url(#${blurId})`}
            />
          </>
        ) : (
          <rect
            x="2.9"
            y="6.6"
            width="18.2"
            height="1.7"
            rx="0.8"
            fill="#0a0a0c"
            opacity="0.4"
            filter={`url(#${blurId})`}
          />
        )}
        <path d={open ? OPEN_FRONT : FRONT_BODY} fill={`url(#${frontId})`} />
      </g>
    </svg>
  );
}
