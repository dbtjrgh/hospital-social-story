import { useEffect, useRef } from 'react';
import type { Phase } from '../content/types';
import { fx } from '../fx/fx';
import { asset } from '../lib/asset';
import { playSynth } from '../lib/sound';
import { getReading, speak, stopSpeaking } from '../lib/speech';
import { getState } from '../lib/store';
import { useTapGuard } from '../lib/tapGuard';
import { Overlay } from './Overlay';

/** 칭찬 소리 뒤에 짧게 읽어 줌 (글을 못 읽어도 칭찬을 듣게 — 2026-10-06 최종 검토). "했어요"를 누른 데 대한 반응 */
const SAY_AFTER_MS = 250;
const SAY = '스티커를 받았어요!';
/** 적어도 이만큼 보여 주고, "스티커를 받았어요!"를 다 읽으면 저절로 닫힘 */
const SHOW_MS = 1500;
/** 읽기가 끝났다는 알림이 안 와도 이만큼 지나면 닫힘 */
const MAX_MS = 4000;
/** "했어요"를 연달아 누른 두 번째 누름이 창을 바로 닫지 않게 (페이지 버튼의 0.7초보다 짧게) */
const TAP_LOCK_MS = 400;

/**
 * 묶음 하나를 마치면 스티커 받기. 1.5초가 지나고 "스티커를 받았어요!"를 다 읽으면 저절로 닫히고 다음으로 (읽기를 끄면 1.5초),
 * 화면 아무 곳이나 누르면 바로 다음으로 (Esc도).
 * 본인 요청 2026-10-07: 예전엔 "다음으로"를 눌러야 닫혀서 2단계마다 흐름이 끊겼음.
 * 2026-10-09 버그: 1.5초에 바로 닫혀서 기기 음성이 "스티커를 받았어요"를 다 읽기 전에 다음 페이지로 넘어가며 끊겼음 → 다 읽을 때까지 기다림 (4초까지)
 */
export function StickerToast({ phase, onDone }: { phase: Phase; onDone: () => void }) {
  const card = useRef<HTMLButtonElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  /** 한 번만 닫음 (저절로 닫힘·누름·페이지 떠남 중 먼저 온 것) */
  const closed = useRef(false);
  const close = () => {
    if (closed.current) return;
    closed.current = true;
    done.current();
  };
  const guard = useTapGuard(TAP_LOCK_MS);

  useEffect(() => {
    // 개발 모드(StrictMode)는 효과를 한 번 정리했다가 다시 돌림 → 정리 때 막은 것을 다시 풂
    closed.current = false;
    playSynth('chime');
    // 닫히는 때 = 1.5초가 지났고 + 읽기가 끝났을 때 (읽기를 끈 기기는 1.5초)
    let shown = false;
    let said = !getState().settings.readAloud;
    const tryClose = () => {
      if (shown && said) close();
    };
    const timers = [
      window.setTimeout(() => card.current && fx.celebrate(card.current, 10), 200),
      window.setTimeout(() => {
        if (said) return;
        speak(SAY, {
          onEnd: () => {
            said = true;
            tryClose();
          },
        });
      }, SAY_AFTER_MS),
      window.setTimeout(() => {
        shown = true;
        tryClose();
      }, SHOW_MS),
      window.setTimeout(close, MAX_MS),
    ];
    return () => {
      closed.current = true; // 페이지를 떠나면(뒤로 가기 등) 저절로 넘어가지 않게
      timers.forEach((t) => window.clearTimeout(t));
      if (getReading()?.text === SAY) stopSpeaking();
    };
  }, []);

  return (
    <Overlay label="스티커를 받았어요" onClose={guard(close)}>
      <button ref={card} type="button" className="toast-card" onClick={guard(close)} aria-live="polite">
        <img src={asset(phase.sticker)} alt="" />
        <strong>스티커를 받았어요!</strong>
        <span>{phase.title} 잘했어요</span>
      </button>
    </Overlay>
  );
}
