// 연타 막기: 아래 버튼은 모든 페이지에서 같은 자리라, 두 번 누르면 다음 페이지 버튼까지 눌려 단계를 건너뜀.
// 화면이 열린 직후 잠깐만 누름을 무시하고 버튼은 그대로 보임 → "했어요는 항상 누를 수 있음"(CLAUDE.md 3-2)과 함께 씀.
// 사용: const guard = useTapGuard(); <button onClick={guard(() => goto(1))}>
import { useEffect, useRef } from 'react';

/** 화면이 열린 뒤 이 시간 동안의 누름은 무시 (페이지가 밀려 들어오는 0.42초 + 여유) */
export const TAP_LOCK_MS = 700;

export function useTapGuard(ms = TAP_LOCK_MS) {
  const readyAt = useRef(Infinity);
  useEffect(() => {
    readyAt.current = performance.now() + ms;
  }, [ms]);
  return <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A) => {
      if (performance.now() >= readyAt.current) fn(...args);
    };
}
