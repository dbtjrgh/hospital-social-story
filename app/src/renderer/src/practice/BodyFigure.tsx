// 몸 그림 (앞모습). 부위 고르기(tapArea)·패드 붙이기(placePads) 연습이 같이 씀.
// 좌표계 200×300 고정 → children 으로 같은 좌표에 젤·패드 등을 겹쳐 그림.
import { useId, type KeyboardEvent, type ReactNode } from 'react';
import type { BodyPart, PadSpot } from '../content/types';

export const BODY_LABEL: Record<BodyPart, string> = { head: '머리', chest: '가슴', belly: '배', arm: '팔', leg: '다리' };

/** 부위의 가운데 (젤·표시를 그릴 자리) */
export const BODY_CENTER: Record<BodyPart, { x: number; y: number }> = {
  head: { x: 100, y: 44 },
  chest: { x: 100, y: 112 },
  belly: { x: 100, y: 166 },
  arm: { x: 40, y: 150 },
  leg: { x: 100, y: 240 },
};

/** 패드(심전도 스티커) 붙이는 자리. 손목·발목은 그림의 팔·다리 끝 (팔은 12도 기울어져 있음) */
export const PAD_SPOT: Record<PadSpot, { x: number; y: number; label: string }> = {
  'chest-1': { x: 80, y: 102, label: '가슴 첫째 자리' },
  'chest-2': { x: 104, y: 120, label: '가슴 둘째 자리' },
  'chest-3': { x: 128, y: 102, label: '가슴 셋째 자리' },
  'wrist-left': { x: 34, y: 166, label: '왼쪽 손목' },
  'wrist-right': { x: 166, y: 166, label: '오른쪽 손목' },
  'ankle-left': { x: 84, y: 268, label: '왼쪽 발목' },
  'ankle-right': { x: 116, y: 268, label: '오른쪽 발목' },
};

const SKIN = '#f6d7c3';
const SHIRT = '#bcd7f5';
const PANTS = '#7f9cc9';
/** 걷어 올린 옷단 */
const PANTS_CUFF = '#6d8bba';
const SLEEVE_CUFF = '#a7c7ee';

interface Props {
  /** 있으면 부위를 누를 수 있음 */
  onPart?: (part: BodyPart) => void;
  /** 부드럽게 빛나게 할 부위 (안내) */
  hint?: BodyPart | null;
  /** 윗옷을 올려 배를 드러낸 모습 (초음파) */
  bareBelly?: boolean;
  /** 윗옷을 올려 가슴·배를 드러낸 모습 (심전도) */
  bareChest?: boolean;
  /** 양말을 벗고 바지·소매를 걷은 모습 (심전도 손목·발목). 패드 자리가 옷 위가 아니라 맨살에 오게 (2026-10-06 최종 검토) */
  bareFeet?: boolean;
  /** 그림 전체 설명 (화면 읽기) */
  label: string;
  children?: ReactNode;
}

export function BodyFigure({ onPart, hint, bareBelly = false, bareChest = false, bareFeet = false, label, children }: Props) {
  // 가슴을 드러내면 배도 드러남 (옷을 위로 올림)
  const belly = bareBelly || bareChest;
  const glowId = `glow-${useId().replace(/:/g, '')}`;

  const part = (name: BodyPart, shapes: ReactNode) => {
    const interactive = !!onPart;
    return (
      <g
        className={interactive ? 'body__part' : undefined}
        filter={hint === name ? `url(#${glowId})` : undefined}
        {...(interactive && {
          role: 'button',
          tabIndex: 0,
          'aria-label': BODY_LABEL[name],
          onClick: () => onPart(name),
          onKeyDown: (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onPart(name);
            }
          },
        })}
      >
        {shapes}
      </g>
    );
  };

  return (
    <svg className="body" viewBox="0 0 200 300" role="group" aria-label={label}>
      <defs>
        {/* 안내 빛: 깜빡이지 않는 부드러운 노란 테두리 */}
        <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#ffb703" floodOpacity="0.95" />
          <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor="#ffb703" floodOpacity="1" />
        </filter>
      </defs>

      {part(
        'leg',
        <>
          {bareFeet ? (
            // 바지를 무릎 아래까지 걷어 올림 → 발목은 맨살
            <>
              <rect x="70" y="194" width="28" height="90" rx="13" fill={SKIN} />
              <rect x="102" y="194" width="28" height="90" rx="13" fill={SKIN} />
              <rect x="70" y="194" width="28" height="56" rx="13" fill={PANTS} />
              <rect x="102" y="194" width="28" height="56" rx="13" fill={PANTS} />
              <rect x="68" y="242" width="32" height="10" rx="5" fill={PANTS_CUFF} />
              <rect x="100" y="242" width="32" height="10" rx="5" fill={PANTS_CUFF} />
            </>
          ) : (
            <>
              <rect x="70" y="194" width="28" height="90" rx="13" fill={PANTS} />
              <rect x="102" y="194" width="28" height="90" rx="13" fill={PANTS} />
            </>
          )}
          <ellipse cx="82" cy="288" rx="17" ry="8" fill={bareFeet ? SKIN : '#5a6f94'} />
          <ellipse cx="118" cy="288" rx="17" ry="8" fill={bareFeet ? SKIN : '#5a6f94'} />
        </>,
      )}
      {part(
        'arm',
        <>
          <g transform="rotate(12 50 90)">
            {bareFeet && <rect x="38" y="84" width="24" height="96" rx="12" fill={SKIN} />}
            <rect x="38" y="84" width="24" height={bareFeet ? 62 : 96} rx="12" fill={SHIRT} />
            {bareFeet && <rect x="36" y="138" width="28" height="10" rx="5" fill={SLEEVE_CUFF} />}
            <circle cx="50" cy="184" r="12" fill={SKIN} />
          </g>
          <g transform="rotate(-12 150 90)">
            {bareFeet && <rect x="138" y="84" width="24" height="96" rx="12" fill={SKIN} />}
            <rect x="138" y="84" width="24" height={bareFeet ? 62 : 96} rx="12" fill={SHIRT} />
            {bareFeet && <rect x="136" y="138" width="28" height="10" rx="5" fill={SLEEVE_CUFF} />}
            <circle cx="150" cy="184" r="12" fill={SKIN} />
          </g>
        </>,
      )}
      {part(
        'belly',
        <>
          <path d="M60 138 H140 V184 Q140 198 126 198 H74 Q60 198 60 184 Z" fill={belly ? SKIN : SHIRT} />
          {belly && <circle cx="100" cy="172" r="2.6" fill="#d9a98f" />}
        </>,
      )}
      {part(
        'chest',
        <>
          <path d="M60 98 Q60 80 78 80 H122 Q140 80 140 98 V140 H60 Z" fill={bareChest ? SKIN : SHIRT} />
          {/* 걷어 올린 옷자락: 가슴까지면 어깨에, 배만이면 가슴 아래에 */}
          {bareChest ? (
            <rect x="58" y="78" width="84" height="14" rx="7" fill="#a7c7ee" />
          ) : (
            bareBelly && <rect x="58" y="132" width="84" height="12" rx="6" fill="#a7c7ee" />
          )}
        </>,
      )}
      {part(
        'head',
        <>
          <rect x="91" y="64" width="18" height="20" rx="6" fill={SKIN} />
          <circle cx="100" cy="44" r="28" fill={SKIN} />
          <path d="M72 42 Q72 14 100 14 Q128 14 128 42 Q118 28 100 28 Q82 28 72 42 Z" fill="#5b4636" />
          <circle cx="90" cy="47" r="2.6" fill="#3b3b3b" />
          <circle cx="110" cy="47" r="2.6" fill="#3b3b3b" />
          <path d="M92 56 Q100 62 108 56" stroke="#b5735a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </>,
      )}
      {children}
    </svg>
  );
}
