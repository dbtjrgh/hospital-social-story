import { useEffect, useRef, type RefObject } from 'react';
import { onSpeakingChange, onSpeechFinished } from '../lib/speech';
import { useSettings } from '../lib/store';
import { fx } from './fx';

/** 앱 틀 안에 한 번만 둠. PixiJS 캔버스가 여기에 붙음 */
export function FxLayer() {
  const ref = useRef<HTMLDivElement>(null);
  const { reduceMotion, guideHand } = useSettings();

  useEffect(() => {
    const host = ref.current;
    const frame = host?.closest<HTMLElement>('[data-app-frame]');
    if (!host || !frame) return;
    void fx.attach(frame, host);
    return () => fx.detach();
  }, []);

  // 읽어 주는 동안은 시선 유도를 멈추고, 끝까지 다 읽으면 바로 빛 고리
  useEffect(() => onSpeakingChange((on) => fx.setPaused('speech', on)), []);
  useEffect(() => onSpeechFinished(() => fx.promptNow()), []);

  useEffect(() => fx.setHandEnabled(guideHand), [guideHand]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => fx.setReduceMotion(reduceMotion === 'on' || (reduceMotion === 'system' && mq.matches));
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [reduceMotion]);

  return <div className="fx-layer" ref={ref} aria-hidden="true" />;
}

/** 이 화면에서 "다음에 누를 곳". 오래 멈추면 빛 고리 → 손가락이 가리킴 (스티커판처럼 끝난 화면엔 쓰지 않음) */
export function useGuide(ref: RefObject<HTMLElement | null>, key: unknown): void {
  useEffect(() => {
    fx.setGuide(ref.current);
    return () => fx.setGuide(null);
  }, [ref, key]);
}
