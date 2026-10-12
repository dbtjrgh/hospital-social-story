// "패드 붙이기" 연습 (PDF 심전도: 몸의 센서 부착 위치에 패드를 붙여 보고, 자극에 대한 느낌 듣기).
// 몸 그림의 점선 동그라미 자리에 패드를 붙임: 아래 패드를 끌어다 놓거나, 자리를 눌러도 붙음 (손 움직임이 어려운 아이도 가능).
// 다음에 붙일 자리는 부드럽게 빛남. 첫 패드를 붙이면 느낌 문장을 들려줌. 다른 곳에 놓아도 실패 표시 없이 다시 안내.
// 붙일 때마다 "톡" 효과음 + 패드가 통통 붙고 둘레로 물결·작은 별 (본인 요청 2026-10-07)
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { PadSpot, SoundRef } from '../content/types';
import { FeelBox } from '../components/FeelBox';
import { SpeakButton } from '../components/SpeakButton';
import { fx } from '../fx/fx';
import { devEvent } from '../lib/devlog';
import { playSound, playSynth, SOUND_LEVELS } from '../lib/sound';
import { speak } from '../lib/speech';
import { BodyFigure, PAD_SPOT } from './BodyFigure';

/** 놓은 곳에서 이 거리(px) 안의 빈자리에 붙음 → 정확히 맞히지 않아도 됨 */
const DROP_RADIUS = 48;
const FEEL_DELAY_MS = 500;

interface Props {
  spots: PadSpot[];
  /** 앞 단계에서 붙인 패드 (그대로 붙어 있음 — 실제로도 가슴 패드를 붙인 채 손목·발목을 붙임, 2026-10-07 다듬기) */
  prePlaced?: PadSpot[];
  prompt: string;
  success: string;
  feel?: { text: string; sound?: SoundRef };
  bareChest?: boolean;
  bareFeet?: boolean;
  onSuccess: () => void;
}

/** still = 앞 단계에서 이미 붙인 패드 (붙는 연출 없이 그대로) */
function Pad({ x, y, still }: { x: number; y: number; still?: boolean }) {
  return (
    <g className={still ? 'pad pad--still' : 'pad'} transform={`translate(${x} ${y})`} pointerEvents="none">
      {!still && <circle className="pad__ripple" r="11" fill="none" stroke="#ffb703" strokeWidth="3" />}
      <g className="pad__body">
        <circle r="11" fill="#ffffff" stroke="#c4cfdd" strokeWidth="1.5" />
        <circle r="4.5" fill="#c4cfdd" />
      </g>
    </g>
  );
}

export function PlacePadsPractice({ spots, prePlaced = [], prompt, success, feel, bareChest, bareFeet, onSuccess }: Props) {
  const [placed, setPlaced] = useState<PadSpot[]>([]);
  const [missed, setMissed] = useState(false);
  /** 끌고 있는 패드의 위치 (연습 상자 기준 px) */
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const figure = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  const succeeded = useRef(false);
  /** 끄는 중인지 (상태보다 먼저 바뀌어야 해서 ref — 빨리 놓아도 놓친 것으로 치지 않게) */
  const dragging = useRef(false);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const remaining = spots.filter((s) => !placed.includes(s));
  const next = remaining[0];
  const done = remaining.length === 0;

  const place = (spot: PadSpot) => {
    if (placed.includes(spot)) return;
    const now = [...placed, spot];
    setPlaced(now);
    setMissed(false);
    devEvent(`연습: 패드 붙임 ${PAD_SPOT[spot].label} (${now.length}/${spots.length})`);
    // 붙인 자리에서 작은 별 몇 개 (자리 그림은 곧 패드로 바뀌므로 지금 위치로)
    const spotEl = figure.current?.querySelector(`[data-spot="${spot}"]`);
    if (spotEl && now.length < spots.length) fx.celebrate(spotEl, 4);
    if (now.length === 1 && feel) {
      // 첫 패드: 느낌 듣기 (누른 것에 대한 반응으로만, 작게)
      if (feel.sound) playSound(feel.sound, SOUND_LEVELS[0].level);
      else playSynth('pad', 0.8);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => speak(feel.text), FEEL_DELAY_MS);
    } else {
      playSynth('pad', 0.8);
    }
    if (now.length === spots.length && !succeeded.current) {
      succeeded.current = true;
      if (figure.current) fx.celebrate(figure.current, 8);
      devEvent(`연습 성공: 패드 ${spots.length}개 붙이기`);
      onSuccess();
    }
  };

  /** 화면 좌표 → 가장 가까운 빈자리 (DROP_RADIUS 안) */
  const spotAt = (clientX: number, clientY: number): PadSpot | null => {
    let best: { spot: PadSpot; d: number } | null = null;
    for (const el of figure.current?.querySelectorAll<SVGGElement>('[data-spot]') ?? []) {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(clientX - (r.left + r.width / 2), clientY - (r.top + r.height / 2));
      const spot = el.dataset.spot as PadSpot;
      if (d <= DROP_RADIUS && !placed.includes(spot) && (!best || d < best.d)) best = { spot, d };
    }
    return best?.spot ?? null;
  };

  const toBox = (e: PointerEvent) => {
    const el = box.current!;
    const r = el.getBoundingClientRect();
    // 화면을 살짝 줄였을 때(lib/fitScreen.ts) 손가락 위치(보이는 크기) → 상자 안 위치(원래 크기)로 바꿈
    const scale = el.offsetWidth / r.width || 1;
    return { x: (e.clientX - r.left) * scale, y: (e.clientY - r.top) * scale };
  };

  const onTrayDown = (e: PointerEvent<HTMLButtonElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 캡처가 막혀도 끌기는 됨
    }
    dragging.current = true;
    setDrag(toBox(e));
  };
  const onTrayMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (dragging.current) setDrag(toBox(e));
  };
  const onTrayUp = (e: PointerEvent<HTMLButtonElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    setDrag(null);
    const spot = spotAt(e.clientX, e.clientY);
    if (spot) place(spot);
    else setMissed(true);
  };

  const onSpotKey = (spot: PadSpot) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      place(spot);
    }
  };

  const message = done ? success : missed ? '점선 동그라미 위에 놓아 봐요. 동그라미를 눌러도 붙어요.' : prompt;

  return (
    <div className="practice pads" ref={box} aria-live="polite">
      <div className="practice__say">
        <p className="practice__msg" data-tone={done ? 'good' : missed ? 'calm' : undefined}>
          {message}
        </p>
        <SpeakButton text={message} compact />
      </div>

      <div className="tap-area tap-area--wide" ref={figure}>
        <BodyFigure label={`몸 그림. 패드 붙일 자리 ${spots.length}곳`} bareChest={bareChest} bareFeet={bareFeet}>
          {prePlaced
            .filter((spot) => !spots.includes(spot))
            .map((spot) => (
              <Pad key={`pre-${spot}`} x={PAD_SPOT[spot].x} y={PAD_SPOT[spot].y} still />
            ))}
          {spots.map((spot) => {
            const { x, y, label } = PAD_SPOT[spot];
            if (placed.includes(spot)) return <Pad key={spot} x={x} y={y} />;
            return (
              <g
                key={spot}
                className="pad-spot"
                data-spot={spot}
                role="button"
                tabIndex={0}
                aria-label={`${label}에 붙이기`}
                onClick={() => place(spot)}
                onKeyDown={onSpotKey(spot)}
              >
                {/* 누르기 쉬운 넓은 투명 자리: 화면을 80%로 줄여도 손가락 크기(약 64px)쯤. 이웃 자리와 겹쳐도 어느 자리든 붙으니 괜찮음 */}
                <circle cx={x} cy={y} r="28" fill="transparent" />
                {spot === next && <circle cx={x} cy={y} r="15" fill="none" stroke="#ffb703" strokeWidth="3" opacity="0.9" />}
                <circle cx={x} cy={y} r="10" fill="#ffffff" fillOpacity="0.55" stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 3" />
              </g>
            );
          })}
        </BodyFigure>
      </div>

      <div className="pads__tray">
        <span className="pads__count">
          붙인 패드 <b>{placed.length}</b> / {spots.length}
        </span>
        <div className="pads__stack">
          {remaining.map((spot, i) => (
            <button
              key={spot}
              type="button"
              className="pads__pad"
              // 맨 위 패드만 끌 수 있음 (나머지는 쌓여 보이기만)
              disabled={i !== 0}
              aria-label="패드. 몸 그림의 동그라미로 끌어다 놓아요"
              onPointerDown={onTrayDown}
              onPointerMove={onTrayMove}
              onPointerUp={onTrayUp}
              // 키보드(Enter·Space)로 누르면 다음 자리에 붙임. 손가락·마우스는 끌어다 놓기(onTrayUp)라 여기서는 무시 (10-07 검수)
              onClick={(e) => {
                if (e.detail === 0 && next) place(next);
              }}
              onPointerCancel={() => {
                dragging.current = false;
                setDrag(null);
              }}
            />
          ))}
        </div>
      </div>

      {drag && <span className="pads__drag" style={{ left: drag.x, top: drag.y }} aria-hidden="true" />}

      {done && feel && <FeelBox text={feel.text} />}
    </div>
  );
}
