// 세로 태블릿에서 사진을 줄여도 넘치는 화면(연습 그림이 큰 단계)은 화면 내용 전체를 같은 비율로 살짝 줄여 한 화면에.
// 본인 요청 2026-10-06 "스크롤 있는 페이지만 티 안 나게 축소". 글자·누르는 곳이 너무 작아지지 않게 80%까지만 → 그래도 넘치면 스크롤.
// 폰은 원래대로 스크롤 (base.css "세로 태블릿" 묶음과 같은 조건일 때만).
import { useLayoutEffect, type RefObject } from 'react';

const MIN_ZOOM = 0.8;
/** 들어선 뒤 이 시간 동안만 내용이 바뀌면 다시 잼 (페이지가 밀려 들어오고 차례로 나타나는 시간 + 여유) */
const SETTLE_MS = 1200;
/** 세로 태블릿 = .stage 가 600px 이상 · 821px 이상 (base.css "세로 태블릿" @container stage 와 같은 조건, 창 크기가 아님 — 편집기 가운데 영역) */
const isTablet = (stage: HTMLElement) => stage.clientWidth >= 600 && stage.clientHeight >= 821;

export function useFitToScreen(ref: RefObject<HTMLElement | null>, key: unknown): void {
  useLayoutEffect(() => {
    const body = ref.current;
    const screen = body?.closest<HTMLElement>('.screen');
    if (!body || !screen) return;
    const stage = body.closest<HTMLElement>('.stage') ?? document.documentElement;
    // 움직임 줄이기는 모든 속성에 아주 짧은 전환을 걸어서(base.css), 원래 크기로 돌려 재는 순간 값이 늦게 바뀜 → 이 상자만 전환 없음
    body.style.transitionProperty = 'none';

    const fit = () => {
      // 원래 크기로 재 보고, 넘친 만큼만 줄임 (사진은 이미 가장 작아진 상태 → 줄인 만큼 그대로 들어감)
      body.style.zoom = '';
      delete body.dataset.fit;
      if (!isTablet(stage)) return;
      // 줄인 뒤 다시 재서 아직 넘치면 한 번 더 (첫 화면 카드 사진처럼 폭을 따라 커지는 것은 줄인 만큼 덜 줄어듦, 10-07 검수)
      let zoom = 1;
      for (let i = 0; i < 4 && zoom > MIN_ZOOM; i++) {
        const over = screen.scrollHeight - screen.clientHeight;
        if (over <= 1) break;
        const height = body.getBoundingClientRect().height;
        zoom = Math.max(MIN_ZOOM, Math.floor(((height - over - 1) / height) * zoom * 1000) / 1000);
        body.style.zoom = String(zoom);
        body.dataset.fit = String(zoom); // 자동 점검·개발 패널에서 확인용
      }
    };

    fit();
    // 다시 잴 때: 화면 크기가 바뀜(늘) / 들어선 직후 잠깐(SETTLE_MS)은 내용 크기·글·부품이 바뀌거나 글꼴 조각을 받을 때도
    // (Pretendard 는 글자에 따라 조각을 나중에 받아서, 받고 나면 글이 조금 길어짐).
    // 그 뒤로는 내용이 바뀌어도 배율을 그대로 둠 → 연습에 성공해 "느낌" 상자가 나타날 때 화면 전체가 갑자기 커지거나 작아지지 않게
    // (2026-10-06 최종 검토. 늘어난 만큼은 스크롤, 느낌 상자는 components/FeelBox 가 보이게 스크롤함)
    // 한 프레임에 한 번만, 다음 프레임에 → 줄인 결과로 다시 불려도 같은 값이라 거기서 멈춤
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };
    const settleUntil = performance.now() + SETTLE_MS;
    const early = () => {
      if (performance.now() < settleUntil) later();
    };
    const resize = new ResizeObserver(later);
    resize.observe(screen);
    resize.observe(stage); // 편집기에서 칸 너비를 바꾸면 가운데(.stage) 크기가 바뀜
    const grow = new ResizeObserver(early);
    grow.observe(body);
    const changes = new MutationObserver(early);
    changes.observe(body, { childList: true, subtree: true, characterData: true });
    document.fonts?.addEventListener('loadingdone', early);
    // 보호자 메뉴에서 글자 크기를 바꾸면(App 이 <html> 의 --text-scale 을 바꿈) 그때도 다시 잼 (10-07 검수: 들어선 뒤에는 안 맞춰졌음)
    const textScale = new MutationObserver(later);
    textScale.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      grow.disconnect();
      changes.disconnect();
      textScale.disconnect();
      document.fonts?.removeEventListener('loadingdone', early);
      body.style.zoom = '';
    };
  }, [ref, key]);
}
