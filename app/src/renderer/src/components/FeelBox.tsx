import { useEffect, useRef } from 'react';
import { fx } from '../fx/fx';
import { SpeakButton } from './SpeakButton';

const REVEAL_DELAY_MS = 700;

/**
 * 연습에 성공한 뒤의 느낌 (PDF "자극 느낌 듣기"). 나타날 때 아래 버튼 뒤나 화면 밖이면 부드럽게 보이게 함
 * (작은 태블릿·폰에서 연습 그림 아래로 밀려 안 보이던 것 — 2026-10-06 최종 검토)
 */
export function FeelBox({ text }: { text: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // 성공 별을 먼저 보고 나서 (누르고 있던 동그라미가 바로 움직이지 않게)
    const t = window.setTimeout(() => box.current && fx.reveal(box.current), REVEAL_DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div ref={box} className="feel">
      <p className="feel__text">{text}</p>
      <SpeakButton text={text} compact />
    </div>
  );
}
