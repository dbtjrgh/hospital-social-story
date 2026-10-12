// "다음 사람을 위해 지우기" (본인 요청 2026-10-07): 병원 공용 태블릿에서 앞사람의 스티커·기록·이름·설정을 한 번에 처음 상태로.
// 검사를 다 마친 화면(칭찬 스티커판·축하 화면)과 보호자 메뉴에 있음.
// 아이가 실수로 지우지 않게 길게 눌러야 함(1.2초, 지우는 기능이라 보호자 버튼 0.8초보다 길게) + 확인 창. 짧게 누르면 안내 말만.
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { markHistoryBarrier, navigate } from '../lib/router';
import { stopSpeaking } from '../lib/speech';
import { resetForNextPerson } from '../lib/store';
import { Icon } from './Icon';

const LONG_PRESS_MS = 1200;
const HINT_MS = 2000;

/** 확인 창 → 모두 지우고 첫 화면으로. 지웠으면 true */
export function clearForNextPerson(): boolean {
  if (!window.confirm('스티커·연습 기록과 이름·설정을 모두 지우고 처음 상태로 돌릴까요?')) return false;
  stopSpeaking();
  resetForNextPerson();
  // 뒤로 가기를 눌러도 앞사람이 보던 페이지가 안 나오게 (10-07 검수, lib/router.ts)
  markHistoryBarrier();
  navigate({ name: 'home' });
  return true;
}

export function NextPersonButton() {
  const [pressing, setPressing] = useState(false);
  const [hint, setHint] = useState(false);
  const pressTimer = useRef(0);
  const hintTimer = useRef(0);
  const fired = useRef(false);

  useEffect(
    () => () => {
      window.clearTimeout(pressTimer.current);
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
    fired.current = false;
    setPressing(true);
    pressTimer.current = window.setTimeout(() => {
      fired.current = true;
      setPressing(false);
      clearForNextPerson();
    }, LONG_PRESS_MS);
  };
  const stop = () => {
    window.clearTimeout(pressTimer.current);
    if (pressing && !fired.current) {
      setHint(true);
      window.clearTimeout(hintTimer.current);
      hintTimer.current = window.setTimeout(() => setHint(false), HINT_MS);
    }
    setPressing(false);
  };

  return (
    <div className="next-person">
      <button
        type="button"
        className="next-person__btn"
        data-pressing={pressing}
        aria-label="다음 사람을 위해 지우기 (길게 누르기, 키보드는 Enter)"
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            clearForNextPerson();
          }
        }}
      >
        <span className="next-person__fill" />
        <Icon name="refresh" />
        <span>다음 사람을 위해 지우기</span>
      </button>
      {hint && (
        <span className="next-person__hint" role="status">
          직원·보호자용이에요. 길게 눌러 주세요
        </span>
      )}
    </div>
  );
}
