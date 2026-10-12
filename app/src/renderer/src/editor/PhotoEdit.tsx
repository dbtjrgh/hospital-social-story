// 가운데 화면의 사진 위 덧그림 (편집 모드에서만, 본인 요청 2026-10-08 "조정은 화면에서")
//   보통: "사진·영상 바꾸기" + "배치 조정" 버튼, 파일을 끌어다 놓으면 바뀜
//   배치 조정: 끌어서 옮기기 · 마우스 휠이나 −/+ 로 크기 · 처음대로 · 취소 · 완료 (완료하면 원고 imageView 에 저장, 되돌리기 가능)
//   터치(모바일·태블릿, 본인 요청 2026-10-08): 한 손가락 = 옮기기, 두 손가락 벌리기·오므리기 = 크기 (+ 옮기기). 조정 중에는 화면 스크롤·확대 막음
//   키보드: 화살표 = 옮기기, + − = 크기, Enter = 완료, Esc = 취소
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { ImageView } from '../content/types';
import { mediaStatus } from '../lib/asset';
import type { PhotoEditProps } from '../lib/editHook';
import { useRoute } from '../lib/router';
import { replaceMedia, saveView } from './actions';
import { useEditor } from './editorState';
import { IMAGE_ACCEPT, MEDIA_ACCEPT, pickFile } from './media';
import { pageLabel } from './slots';

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 4;
const MOVE_MAX = 150; // 자리 폭·높이의 %
const DEFAULT_VIEW: ImageView = { x: 0, y: 0, zoom: 1 };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const tidy = (v: ImageView): ImageView => ({
  x: clamp(v.x, -MOVE_MAX, MOVE_MAX),
  y: clamp(v.y, -MOVE_MAX, MOVE_MAX),
  zoom: clamp(v.zoom, ZOOM_MIN, ZOOM_MAX),
});

export function PhotoEdit({ path, view, field, setLive }: PhotoEditProps) {
  const { mode } = useEditor();
  const route = useRoute();
  const [over, setOver] = useState(false);
  /** 배치 조정 중인 값 (null = 조정 안 함) */
  const [adjust, setAdjust] = useState<ImageView | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  /** 화면에 닿아 있는 손가락·마우스 (pointerId → 위치) */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  /** 지금 몸짓의 시작: 그때의 배치와 손가락 위치 (손가락 수가 바뀌면 다시 잡음) */
  const gesture = useRef<{ start: ImageView; w: number; h: number; mid: { x: number; y: number }; dist: number } | null>(null);
  const adjustRef = useRef(adjust);
  adjustRef.current = adjust;

  const label = `${pageLabel(route)} 사진`;
  const exists = mediaStatus(path) !== 'missing';

  const update = (next: ImageView) => {
    const v = tidy(next);
    setAdjust(v);
    setLive(v);
  };

  // 휠로 크기 (화면이 스크롤되지 않게 passive 가 아닌 리스너로)
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !adjust) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cur = adjustRef.current;
      if (cur) update({ ...cur, zoom: cur.zoom * Math.exp(-e.deltaY * 0.0015) });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!adjust]);

  if (mode !== 'edit') return null;

  const start = () => {
    update(view ?? DEFAULT_VIEW);
    // 조정 막대의 키보드가 바로 먹게
    window.setTimeout(() => boxRef.current?.focus(), 0);
  };
  const cancel = () => {
    setAdjust(null);
    setLive(null);
  };
  const done = () => {
    if (!adjust || !field) return;
    void saveView(field, adjust, label);
    setAdjust(null);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void replaceMedia({ path, label, field }, file);
  };

  if (adjust) {
    /** 닿아 있는 손가락 1~2개의 가운데·거리 */
    const measure = () => {
      const pts = [...pointers.current.values()].slice(0, 2);
      const mid = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
      const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
      return { mid, dist };
    };
    /** 손가락 수가 바뀌면 지금 모양에서 다시 시작 (튀지 않게) */
    const rebase = (el: HTMLElement) => {
      if (pointers.current.size === 0 || !adjustRef.current) {
        gesture.current = null;
        return;
      }
      const r = el.getBoundingClientRect();
      gesture.current = { start: adjustRef.current, w: r.width, h: r.height, ...measure() };
    };
    const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('.ed-adjust__bar')) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      rebase(e.currentTarget);
    };
    const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = gesture.current;
      if (!g) return;
      const { mid, dist } = measure();
      const zoom = g.dist > 0 && dist > 0 ? g.start.zoom * (dist / g.dist) : g.start.zoom;
      update({ x: g.start.x + ((mid.x - g.mid.x) / g.w) * 100, y: g.start.y + ((mid.y - g.mid.y) / g.h) * 100, zoom });
    };
    const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
      pointers.current.delete(e.pointerId);
      rebase(e.currentTarget);
    };
    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      // 조절 막대(화면 아래, React 에서는 이 안)의 크기 막대는 화살표로 크기만 바꿈 — 사진을 같이 옮기지 않게
      if ((e.target as HTMLElement).tagName === 'INPUT' && e.key.startsWith('Arrow')) return;
      const step = e.shiftKey ? 5 : 1;
      const moves: Record<string, Partial<ImageView>> = {
        ArrowLeft: { x: adjust.x - step },
        ArrowRight: { x: adjust.x + step },
        ArrowUp: { y: adjust.y - step },
        ArrowDown: { y: adjust.y + step },
      };
      if (moves[e.key]) update({ ...adjust, ...moves[e.key] });
      else if (e.key === '+' || e.key === '=') update({ ...adjust, zoom: adjust.zoom * 1.1 });
      else if (e.key === '-') update({ ...adjust, zoom: adjust.zoom / 1.1 });
      else if (e.key === 'Enter') done();
      else if (e.key === 'Escape') cancel();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    return (
      <div
        ref={boxRef}
        className="ed-photo ed-photo--adjust"
        tabIndex={0}
        role="application"
        aria-label="사진 배치 조정: 끌거나 화살표로 옮기고, 휠·두 손가락·+ − 로 크기를 바꿔요. Enter 완료, Esc 취소"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
      >
        {/* 조절 막대는 사진 밖, 화면 아래에 떠 있음 → 사진이 작아도(좁은 창·연습 단계) 늘 다 보이고 손가락으로 누르기 좋음 */}
        {createPortal(
        <div className="ed-adjust__bar" role="toolbar" aria-label="배치 조정" onPointerDown={(e) => e.stopPropagation()}>
          <span className="ed-adjust__hint">사진을 끌어서 옮기고, 휠이나 두 손가락으로 크기를 바꿔요</span>
          <button type="button" className="ed-adjust__icon" onClick={() => update({ ...adjust, zoom: adjust.zoom / 1.1 })} aria-label="작게">
            −
          </button>
          <input
            type="range"
            min={ZOOM_MIN * 100}
            max={ZOOM_MAX * 100}
            step={5}
            value={Math.round(adjust.zoom * 100)}
            onChange={(e) => update({ ...adjust, zoom: Number(e.target.value) / 100 })}
            aria-label="크기"
          />
          <button type="button" className="ed-adjust__icon" onClick={() => update({ ...adjust, zoom: adjust.zoom * 1.1 })} aria-label="크게">
            +
          </button>
          <span className="ed-adjust__pct">{Math.round(adjust.zoom * 100)}%</span>
          <button type="button" className="ed-adjust__btn" onClick={() => update(DEFAULT_VIEW)}>
            처음대로
          </button>
          <button type="button" className="ed-adjust__btn" onClick={cancel}>
            취소
          </button>
          <button type="button" className="ed-adjust__btn ed-adjust__btn--ok" onClick={done}>
            완료
          </button>
        </div>,
          document.body,
        )}
      </div>
    );
  }

  return (
    <div
      className={`ed-photo${over ? ' is-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <div className="ed-photo__btns">
        <button
          type="button"
          className="ed-photo__btn"
          onClick={async (e) => {
            e.stopPropagation();
            const f = await pickFile(field ? MEDIA_ACCEPT : IMAGE_ACCEPT);
            if (f) void replaceMedia({ path, label, field }, f);
          }}
        >
          {exists ? (field ? '사진·영상 바꾸기' : '사진 바꾸기') : field ? '사진·영상 넣기' : '사진 넣기'}
        </button>
        {exists && field && (
          <button
            type="button"
            className="ed-photo__btn"
            onClick={(e) => {
              e.stopPropagation();
              start();
            }}
          >
            배치 조정
          </button>
        )}
      </div>
      <span className="ed-photo__hint">{over ? '여기에 놓으면 바뀌어요' : '파일을 끌어다 놓아도 돼요'}</span>
    </div>
  );
}
