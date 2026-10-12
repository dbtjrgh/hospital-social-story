import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { fx } from '../fx/fx';
import { onOverlayEntry } from '../lib/router';

// 안드로이드·브라우저 뒤로 가기로 창(보호자 메뉴·스티커 창)을 닫음 (10-07 검수: 창은 그대로이고 뒤 페이지로 넘어갔음).
// 창이 열리면 같은 주소의 방문 기록 칸을 하나 쌓고, 뒤로 가기로 그 칸이 빠지면 맨 위 창을 닫음.
// 다른 방법(닫기·배경·Esc)으로 닫으면 쌓은 칸을 되돌림. 창이 열린 채 페이지를 옮기면 그 칸을 바꿔 씀 (lib/router.ts navigate)
const openOverlays: Array<() => void> = [];
let ignorePop = false;
window.addEventListener('popstate', () => {
  if (ignorePop) {
    ignorePop = false;
    return;
  }
  if (openOverlays.length && !onOverlayEntry()) openOverlays[openOverlays.length - 1]();
});

/** 앱 틀 위에 겹쳐 띄움 (PC에서는 태블릿 틀 안, 휴대폰에서는 화면 전체) */
export function Overlay({
  children,
  onClose,
  label,
  className,
}: {
  children: ReactNode;
  onClose?: () => void;
  label: string;
  className?: string;
}) {
  // 배경에서 누르기 시작한 것만 "배경 누름"으로 닫음. 보호자 버튼을 길게 눌러 열면 손을 뗄 때 click이 배경에 떨어짐
  // (태블릿에서 시트가 손가락 아래까지 안 올라옴) → 열자마자 닫히지 않게 (2026-10-07 다듬기)
  const downOnBackdrop = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    fx.setModal(true);
    return () => fx.setModal(false);
  }, []);

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 뒤로 가기로 닫기 (위 설명)
  useEffect(() => {
    const close = () => closeRef.current?.();
    openOverlays.push(close);
    if (!onOverlayEntry()) window.history.pushState({ ...(window.history.state as object | null), overlay: true }, '');
    return () => {
      openOverlays.splice(openOverlays.indexOf(close), 1);
      // 개발 모드(StrictMode)는 닫자마자 다시 열어 봄 → 한 박자 뒤에 열린 창이 없을 때만 쌓은 칸을 되돌림
      window.setTimeout(() => {
        if (openOverlays.length || !onOverlayEntry()) return;
        ignorePop = true;
        window.history.back();
      });
    };
  }, []);

  // 키보드 초점을 창으로 옮기고, 뒤 화면은 inert (Tab·화면 읽기 프로그램이 창 뒤로 가지 않게, 10-07 검수). 닫으면 원래 자리로
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const behind = [...(node.parentElement?.children ?? [])].filter((el) => el !== node && !el.hasAttribute('inert'));
    behind.forEach((el) => el.setAttribute('inert', ''));
    node.focus({ preventScroll: true });
    return () => {
      behind.forEach((el) => el.removeAttribute('inert'));
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, []);

  const frame = document.querySelector('[data-app-frame]') ?? document.body;
  return createPortal(
    <div
      ref={box}
      className={className ? `overlay ${className}` : 'overlay'}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && downOnBackdrop.current) onClose?.();
        downOnBackdrop.current = false;
      }}
    >
      {children}
    </div>,
    frame,
  );
}
