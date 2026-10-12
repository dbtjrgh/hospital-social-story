import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { ExamContent, Step } from '../content/types';
import { navigate } from '../lib/router';
import { CaregiverSheet } from './CaregiverSheet';
import { Icon } from './Icon';

// 1.2초는 길다는 본인 의견으로 0.8초 (2026-10-08). base.css .caregiver-btn__fill 의 transition 과 같게
const LONG_PRESS_MS = 800;

/** 보호자 버튼: 길게 눌러야 열림. 짧게 누르면 안내 말풍선만 */
export function CaregiverButton({ exam, step }: { exam?: ExamContent; step?: Step }) {
  const [open, setOpen] = useState(false);
  const [pressing, setPressing] = useState(false);
  const [hint, setHint] = useState(false);
  const timer = useRef(0);
  const hintTimer = useRef(0);
  const opened = useRef(false);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(hintTimer.current);
    },
    [],
  );

  const start = (e: PointerEvent<HTMLButtonElement>) => {
    // 누르는 동안 손가락이 조금 밀려 버튼 밖으로 나가도 풀리지 않게 (본인 지적 2026-10-07)
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 캡처가 막혀도 길게 누르기는 됨
    }
    opened.current = false;
    setPressing(true);
    timer.current = window.setTimeout(() => {
      opened.current = true;
      setPressing(false);
      setOpen(true);
    }, LONG_PRESS_MS);
  };
  const stop = () => {
    window.clearTimeout(timer.current);
    if (pressing && !opened.current) {
      setHint(true);
      window.clearTimeout(hintTimer.current);
      hintTimer.current = window.setTimeout(() => setHint(false), 2000);
    }
    setPressing(false);
  };

  return (
    <span className="caregiver">
      <button
        type="button"
        className="icon-btn caregiver-btn"
        data-pressing={pressing}
        aria-label="보호자 안내 (길게 누르기, 키보드는 Enter)"
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="caregiver-btn__fill" />
        <Icon name="people" />
        <span>보호자</span>
      </button>
      {/* 말풍선은 버튼 왼쪽 (아래에 두면 진행 숫자를 가림) */}
      {hint && (
        <span className="hint-bubble" role="status">
          <span>보호자 메뉴는 길게 눌러 주세요</span>
        </span>
      )}
      {open && <CaregiverSheet exam={exam} step={step} onClose={() => setOpen(false)} />}
    </span>
  );
}

export function TopBar({ exam, step, title }: { exam?: ExamContent; step?: Step; title?: string }) {
  return (
    <header className="topbar">
      <button type="button" className="icon-btn" onClick={() => navigate({ name: 'home' })} aria-label="첫 화면으로">
        <Icon name="home" />
        {/* "처음"은 "처음부터 다시"로도 읽혀서 "첫 화면" (2026-10-07) */}
        <span>첫 화면</span>
      </button>
      <div className="topbar__title">{title ?? exam?.title}</div>
      <CaregiverButton exam={exam} step={step} />
    </header>
  );
}
