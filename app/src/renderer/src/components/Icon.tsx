// 선 아이콘 모음 (이모지는 기기마다 모양이 달라서 쓰지 않음)
import type { SensoryKind } from '../content/types';

const paths = {
  home: (
    <>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M6 9.8V20h12V9.8" />
      <path d="M10 20v-5.5h4V20" />
    </>
  ),
  speaker: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none" />
      <path className="wave" d="M15.5 9a4.5 4.5 0 0 1 0 6" />
      <path className="wave" d="M18.2 6.5a8 8 0 0 1 0 11" />
    </>
  ),
  check: <path d="M5 12.5 10 17.5 19.5 7" strokeWidth={3} />,
  back: <path d="M14.5 5.5 8 12l6.5 6.5" strokeWidth={2.8} />,
  next: <path d="M9.5 5.5 16 12l-6.5 6.5" strokeWidth={2.8} />,
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" />,
  star: (
    <path
      d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.6l-5.1 2.7 1-5.7-4.1-4 5.7-.8z"
      fill="currentColor"
      strokeLinejoin="round"
    />
  ),
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4.5H15" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.3" />
      <path d="M3 19.5a6 6 0 0 1 12 0" />
      <circle cx="17" cy="9.5" r="2.4" />
      <path d="M15.8 14.2a4.6 4.6 0 0 1 5.2 5.3" />
    </>
  ),
  list: (
    <>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <circle cx="4.5" cy="6.5" r="1.2" fill="currentColor" />
      <circle cx="4.5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="4.5" cy="17.5" r="1.2" fill="currentColor" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="3" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M4.5 17.5 10 13l3.5 3 2.5-2 4 3.5" />
    </>
  ),
  hospital: (
    <>
      <path d="M4 20V8.5L12 4l8 4.5V20z" />
      <path d="M12 8.5v5M9.5 11h5" strokeWidth={2.4} />
      <path d="M10 20v-3.5h4V20" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  hand: (
    <path d="M9 11.5V5.2a1.6 1.6 0 0 1 3.2 0v5.3m0-1.3a1.6 1.6 0 0 1 3.2 0v1.8m0-.6a1.6 1.6 0 0 1 3.2 0V15a6.5 6.5 0 0 1-6.5 6.5h-.6a6 6 0 0 1-4.8-2.4l-3-4a1.6 1.6 0 0 1 2.5-2L9 15.5" />
  ),
  megaphone: (
    <>
      <path d="M4 10v4h3l7 4V6L7 10z" />
      <path d="M17.5 9.5a3.5 3.5 0 0 1 0 5" />
      <path d="M7 14l1.2 5h2.3" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" strokeWidth={2.6} />,
  /** 쉬기 (일시 멈춤) */
  pause: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10 9v6M14 9v6" strokeWidth={2.4} />
    </>
  ),
  // 감각 카드의 "소리" (귀). 들어보기 버튼의 스피커와 같으면 눌러도 되는 줄 알아서 다르게 (2026-10-06 최종 검토)
  ear: (
    <>
      <path d="M7.5 9.5a5 5 0 0 1 10 0c0 2.8-2.2 3.8-3 5.4-.8 1.6-.6 4.6-3.3 4.6a2.8 2.8 0 0 1-2.7-2.2" />
      <path d="M10.3 9.8a2.2 2.2 0 0 1 4.4 0c0 1.3-1.4 1.6-1.6 2.8" />
    </>
  ),
  // 감각
  cold: (
    <>
      <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
      <path d="M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" />
    </>
  ),
  pressure: (
    <>
      <path d="M3 12h6M6.5 8.5 10 12l-3.5 3.5" />
      <path d="M21 12h-6M17.5 8.5 14 12l3.5 3.5" />
    </>
  ),
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
    </>
  ),
  sting: <path d="M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9L12 18.5l-1.9-5.6L4.5 11l5.6-1.9z" />,
  smell: (
    <>
      <path d="M3 9h10.5a2.8 2.8 0 1 0-2.8-2.8" />
      <path d="M3 13h14a2.8 2.8 0 1 1-2.8 2.8" />
      <path d="M3 17h6" />
    </>
  ),
  wait: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
} as const;

export type IconName = keyof typeof paths;

/** 원고에 적힌 아이콘 이름이 있는지 (없으면 다른 아이콘으로) */
export function isIconName(name: string | undefined): name is IconName {
  return !!name && name in paths;
}

export const SENSE_ICON: Record<SensoryKind, IconName> = {
  sound: 'ear',
  cold: 'cold',
  pressure: 'pressure',
  light: 'light',
  sting: 'sting',
  smell: 'smell',
  wait: 'wait',
  touch: 'hand',
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
