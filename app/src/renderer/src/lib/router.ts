// 해시 라우터. 주소 모양: #/  (검사 선택)   #/xray/3  (엑스레이 3페이지)   #/complete  (5종 다 모은 축하)
// 해시를 쓰는 이유: 어느 경로에 올려도 동작 (서버 설정 불필요)
import { useSyncExternalStore } from 'react';

export type Route = { name: 'home' } | { name: 'complete' } | { name: 'exam'; examId: string; page: number };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'home' };
  if (parts[0] === 'complete') return { name: 'complete' };
  const page = Number(parts[1] ?? 0);
  return { name: 'exam', examId: parts[0], page: Number.isFinite(page) && page >= 0 ? Math.floor(page) : 0 };
}

export function toHash(route: Route): string {
  if (route.name === 'home') return '#/';
  if (route.name === 'complete') return '#/complete';
  return `#/${route.examId}/${route.page}`;
}

// 방문 기록 칸마다 번호(idx)를 붙임 (10-07 검수). "다음 사람을 위해 지우기" 뒤에는 그보다 앞 칸으로 뒤로 가도 첫 화면으로
// → 앞사람이 보던 검사 페이지가 다음 사람에게 나오지 않게. 보호자 메뉴·스티커 창은 같은 주소 칸을 하나 더 쌓아 뒤로 가기로 닫음 (components/Overlay.tsx)
const BARRIER_KEY = 'social-story:history-barrier';

function idxOf(state: unknown): number | null {
  const idx = (state as { idx?: unknown } | null)?.idx;
  return typeof idx === 'number' ? idx : null;
}

/** 지운 뒤 처음 칸 번호. 이보다 작은 칸은 앞사람 것 (같은 탭에서 새로고침해도 남게 sessionStorage) */
let barrier = (() => {
  try {
    return Number(window.sessionStorage.getItem(BARRIER_KEY)) || 0;
  } catch {
    return 0;
  }
})();
let current = idxOf(window.history.state) ?? barrier;

/** 지금 칸에 번호가 없으면 붙이고(= 방금 새로 생긴 칸. 크롬은 주소를 바꿀 때도 popstate 를 내므로 옛 칸으로 보지 않음), 앞사람 칸이면 첫 화면으로 */
function stamp(): void {
  const idx = idxOf(window.history.state);
  if (idx === null) {
    current = Math.max(current + 1, barrier);
    window.history.replaceState({ ...(window.history.state as object | null), idx: current }, '');
  } else {
    current = idx;
  }
  if (current < barrier) {
    current = barrier;
    window.history.replaceState({ idx: barrier }, '', '#/');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
}
stamp();
window.addEventListener('popstate', stamp);
window.addEventListener('hashchange', stamp);

/** "다음 사람을 위해 지우기": 지금까지의 칸은 앞사람 것 → 뒤로 가기로 돌아가지 않게 */
export function markHistoryBarrier(): void {
  barrier = current + 1;
  try {
    window.sessionStorage.setItem(BARRIER_KEY, String(barrier));
  } catch {
    // 저장이 막혀도 이 탭이 열려 있는 동안은 됨
  }
}

/** 보호자 메뉴·스티커 창이 쌓은 칸 위인지 (components/Overlay.tsx) */
export function onOverlayEntry(): boolean {
  return (window.history.state as { overlay?: unknown } | null)?.overlay === true;
}

export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  const hash = toHash(route);
  if (window.location.hash === hash) return;
  // 창이 쌓은 칸 위에서 옮기면 그 칸을 바꿔 씀 → 다음 페이지에서 뒤로 가기 한 번에 진짜 앞 페이지로
  if (options.replace || onOverlayEntry()) {
    current = Math.max(current, barrier);
    window.history.replaceState({ idx: current }, '', hash);
  } else {
    current = Math.max(current + 1, barrier);
    window.history.pushState({ idx: current }, '', hash);
  }
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseHash(hash);
}
