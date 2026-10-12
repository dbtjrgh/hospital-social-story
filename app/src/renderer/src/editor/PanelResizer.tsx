// 편집기 왼쪽·오른쪽 칸 너비 조절 손잡이 (본인 요청 2026-10-08 "드래그로 조정")
//   끌기(마우스·손가락) · 두 번 누르면 처음 너비 · 키보드 ← → (Shift 는 크게)
//   너비는 CSS 변수(--ed-left·--ed-right, editor.css)로 → 가운데 플레이어·조절 막대가 따라 움직임. 이 컴퓨터에 기억(localStorage)
import { useEffect, useState, type KeyboardEvent, type PointerEvent } from 'react';

export type PanelSide = 'left' | 'right';

const SIZES: Record<PanelSide, { def: number; min: number; max: number }> = {
  left: { def: 272, min: 180, max: 480 },
  right: { def: 340, min: 260, max: 600 },
};
/** 가운데 플레이어가 이보다 좁아지지 않게 */
const CENTER_MIN = 360;
const KEY = (side: PanelSide) => `editor:panel:${side}`;

function readSize(side: PanelSide): number {
  try {
    const saved = Number(window.localStorage.getItem(KEY(side)));
    if (saved) return saved;
  } catch {
    // 저장소가 막히면 처음 너비
  }
  return SIZES[side].def;
}

function cssSize(side: PanelSide): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(`--ed-${side}`)) || SIZES[side].def;
}

/** 범위·가운데 최소 폭을 지켜 적용 (저장은 save=true 일 때) */
function applySize(side: PanelSide, px: number, save = false): number {
  const other = cssSize(side === 'left' ? 'right' : 'left');
  const { min, max } = SIZES[side];
  const v = Math.round(Math.max(min, Math.min(max, window.innerWidth - other - CENTER_MIN, px)));
  document.documentElement.style.setProperty(`--ed-${side}`, `${v}px`);
  if (save) {
    try {
      window.localStorage.setItem(KEY(side), String(v));
    } catch {
      // 기억 못 해도 이번 창에서는 바뀜
    }
  }
  return v;
}

let listening = false;

/**
 * 편집기 시작할 때 기억한 너비로. 창 크기가 바뀌어도 기억한 너비 기준으로 다시 맞춤
 * (창이 작을 때 가운데를 지키느라 줄어든 칸이, 창을 키우면 원래 너비로 돌아오게)
 */
export function restorePanelSizes(): void {
  applySize('left', readSize('left'));
  applySize('right', readSize('right'));
  if (!listening) {
    listening = true;
    window.addEventListener('resize', restorePanelSizes);
  }
}

export function PanelResizer({ side }: { side: PanelSide }) {
  const [size, setSize] = useState(() => cssSize(side));
  const [dragging, setDragging] = useState(false);

  // 창 크기가 바뀌면 restorePanelSizes 가 다시 맞춤 → 화면 읽기용 값만 따라감
  useEffect(() => {
    const onResize = () => setSize(cssSize(side));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [side]);

  const fromPointer = (clientX: number) => {
    const dock = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--side-dock')) || 0;
    return side === 'left' ? clientX : window.innerWidth - dock - clientX;
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    document.body.classList.add('is-resizing');
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging) setSize(applySize(side, fromPointer(e.clientX)));
  };
  const onPointerEnd = () => {
    if (!dragging) return;
    setDragging(false);
    document.body.classList.remove('is-resizing');
    setSize(applySize(side, cssSize(side), true));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 16;
    // 왼쪽 칸은 → 가 넓게, 오른쪽 칸은 ← 가 넓게
    const grow = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
    const shrink = side === 'left' ? 'ArrowLeft' : 'ArrowRight';
    if (e.key === grow) setSize(applySize(side, cssSize(side) + step, true));
    else if (e.key === shrink) setSize(applySize(side, cssSize(side) - step, true));
    else if (e.key === 'Home') setSize(applySize(side, SIZES[side].def, true));
    else return;
    e.preventDefault();
  };

  return (
    <div
      className={`ed-resizer ed-resizer--${side}${dragging ? ' is-dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={side === 'left' ? '페이지 목록 너비 (끌거나 ← →, 두 번 누르면 처음대로)' : '사진·소리 칸 너비 (끌거나 ← →, 두 번 누르면 처음대로)'}
      aria-valuenow={size}
      aria-valuemin={SIZES[side].min}
      aria-valuemax={SIZES[side].max}
      tabIndex={0}
      title="끌어서 너비를 바꿔요 · 두 번 누르면 처음대로"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onDoubleClick={() => setSize(applySize(side, SIZES[side].def, true))}
      onKeyDown={onKeyDown}
    />
  );
}
