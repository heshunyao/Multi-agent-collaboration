import type { ReactNode, SVGProps } from 'react'

const ICONS: Record<string, ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  stop: <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="7" y="5.5" width="3.4" height="13" rx="1.2" fill="currentColor" stroke="none" />
      <rect x="13.6" y="5.5" width="3.4" height="13" rx="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  chevronDown: <path d="M6 9l6 6 6-6" />,
  check: <path d="M4.5 12.5l5 5L20 6.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  panel: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M9.5 4.5v15" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.6M17.5 19.5a5.6 5.6 0 0 0-1.8-4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3.5l1.9 5.3 5.3 1.9-5.3 1.9L12 17.9l-1.9-5.3L4.8 10.7l5.3-1.9z" />
      <path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3l8.5 4.7L12 12.4 3.5 7.7z" />
      <path d="M3.5 12.2l8.5 4.7 8.5-4.7" />
      <path d="M3.5 16.6l8.5 4.7 8.5-4.7" />
    </>
  ),
  server: (
    <>
      <rect x="3.5" y="3.5" width="17" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="17" height="7" rx="2" />
      <path d="M7 7h.01M7 17h.01M11 7h5M11 17h5" />
    </>
  ),
  code: <path d="M8.5 8L4.5 12l4 4M15.5 8l4 4-4 4M13.5 5l-3 14" />,
  bug: (
    <>
      <rect x="7" y="7.5" width="10" height="12" rx="5" />
      <path d="M12 3v4M8.5 6.5l-2-2M15.5 6.5l2-2M4 11h3M17 11h3M4 16h3M17 16h3" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 2.8v5.6c0 4.4-2.9 7.6-7 9.2-4.1-1.6-7-4.8-7-9.2V5.8z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  package: (
    <>
      <path d="M12 3l8 4.4v8.9L12 21l-8-4.7V7.4z" />
      <path d="M4 7.4l8 4.5 8-4.5M12 12v9" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  zap: <path d="M13 2.5L4.5 14H10l-1 7.5L18.5 10H13z" />,
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="17" r="2" />
    </>
  ),
  trash: <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />,
  file: (
    <>
      <path d="M7 3.5h7l4 4V20.5H7z" />
      <path d="M14 3.5v4h4" />
    </>
  ),
  download: <path d="M12 4v10M8 11l4 4 4-4M4.5 20h15" />,
  terminal: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M7.5 10l2.5 2.5-2.5 2.5M13 15h4" />
    </>
  ),
  share: (
    <>
      <circle cx="6" cy="12" r="2.4" />
      <circle cx="17.5" cy="6" r="2.4" />
      <circle cx="17.5" cy="18" r="2.4" />
      <path d="M8.1 10.9l7.3-3.7M8.1 13.1l7.3 3.7" />
    </>
  ),
  send: <path d="M4.5 12L20 4l-6 16-3.2-6.2z" />,
  dots: (
    <>
      <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  cpu: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M10 2.5v3M14 2.5v3M10 18.5v3M14 18.5v3M2.5 10h3M2.5 14h3M18.5 10h3M18.5 14h3" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4-4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 14a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3.6 14H3.4a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.3-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z" />
    </>
  ),
  refresh: <path d="M20 11a8 8 0 1 0-2.4 5.7M20 5v6h-6" />,
  play: <path d="M8 5.5l11 6.5-11 6.5z" />,
  branch: (
    <>
      <circle cx="6.5" cy="5.5" r="2.2" />
      <circle cx="6.5" cy="18.5" r="2.2" />
      <circle cx="17.5" cy="9" r="2.2" />
      <path d="M6.5 7.7v8.6M17.5 11.2c0 4-4 3.4-8.5 4.6" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="10" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
    </>
  ),
  volume: <path d="M4 9.5h3L12 5v14l-5-4.5H4zM16 9a4.5 4.5 0 0 1 0 6" />,
}

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: string
  size?: number
}

export function Icon({ name, size = 18, ...rest }: IconProps) {
  const content = ICONS[name] ?? ICONS.dots
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {content}
    </svg>
  )
}
