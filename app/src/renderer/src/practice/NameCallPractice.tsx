// 이름 부르기 연습: 안내 방송처럼 이름을 부르면 "네!" 누르기. 대기실에서 내 차례를 알아듣는 연습.
// "네!"는 이름을 다 부른 뒤에 나옴 → 듣지 않고 누르지 않게, 대답한 뒤에 부르는 소리가 나지 않게.
import { useEffect, useRef, useState } from 'react';
import { fx } from '../fx/fx';
import { devEvent } from '../lib/devlog';
import { playSynth } from '../lib/sound';
import { speak, stopSpeaking } from '../lib/speech';
import { useSettings } from '../lib/store';
import { Icon } from '../components/Icon';
import { SpeakButton } from '../components/SpeakButton';

/** 부르기 시작 전 안내 방송 "딩동" 여유 */
const CALL_DELAY_MS = 900;
/** 음원이 끝 신호를 놓쳐도 "네!"가 나오게 (이름 한 줄은 보통 2~3초) */
const CALL_FALLBACK_MS = 6000;
const IDLE_MSG = '이름을 부르면 "네!" 하고 대답해 봐요.';

export function NameCallPractice({ onSuccess }: { onSuccess: () => void }) {
  const { name } = useSettings();
  // calling: 부르는 중 ("네!" 자리만 있고 아직 안 보임) → called: 다 부름, "네!" 누르기
  const [stage, setStage] = useState<'idle' | 'calling' | 'called' | 'done'>('idle');
  const yes = useRef<HTMLButtonElement>(null);
  const timers = useRef<number[]>([]);
  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };
  const callText = name.trim() ? `${name.trim()} 님, 들어오세요.` : '우리 친구, 들어오세요.';

  useEffect(
    () => () => {
      clearTimers();
      stopSpeaking();
    },
    [],
  );

  // "네!" 버튼이 나오면 그곳으로 시선 유도. 대답하면 원래 안내하던 곳("했어요")으로 되돌림
  // (이미 연습한 단계에서 다시 해 보면 단계 화면의 안내가 새로 잡히지 않아, 사라진 "네!"에 남아 있었음 — 2026-10-07 다듬기)
  useEffect(() => {
    const el = yes.current;
    if (stage !== 'called' || !el) return;
    const before = fx.getGuide();
    fx.setGuide(el);
    return () => {
      // 그사이 다른 곳이 안내를 가져갔으면(페이지를 떠남 등) 건드리지 않음
      if (fx.getGuide() === el) fx.setGuide(before?.isConnected ? before : null);
    };
  }, [stage]);

  const call = () => {
    clearTimers();
    setStage('calling');
    playSynth('announce');
    const ready = () => {
      clearTimers();
      setStage((s) => (s === 'calling' ? 'called' : s));
    };
    timers.current.push(
      window.setTimeout(() => speak(callText, { onEnd: ready }), CALL_DELAY_MS),
      window.setTimeout(ready, CALL_DELAY_MS + CALL_FALLBACK_MS),
    );
    devEvent('연습: 이름 부르기');
  };

  const answer = () => {
    clearTimers();
    stopSpeaking();
    setStage('done');
    playSynth('chime');
    if (yes.current) fx.celebrate(yes.current, 8);
    devEvent('연습 성공: 이름 듣고 대답');
    onSuccess();
  };

  return (
    <div className="practice" aria-live="polite">
      {stage === 'idle' && (
        <>
          <div className="practice__say">
            <p className="practice__msg">{IDLE_MSG}</p>
            <SpeakButton text={IDLE_MSG} compact />
          </div>
          <button type="button" className="btn btn--soft" style={{ flex: 'none', minWidth: 240 }} onClick={call}>
            <Icon name="megaphone" /> 이름 불러 보기
          </button>
        </>
      )}
      {(stage === 'calling' || stage === 'called') && (
        <>
          <p className="name-call__bubble">{callText}</p>
          {/* 부르는 동안에도 자리는 차지해서 화면이 흔들리지 않게 */}
          <button
            ref={yes}
            type="button"
            className="btn-yes"
            onClick={answer}
            disabled={stage === 'calling'}
            aria-hidden={stage === 'calling'}
            style={stage === 'calling' ? { visibility: 'hidden' } : undefined}
          >
            네!
          </button>
        </>
      )}
      {stage === 'done' && (
        <>
          <p className="practice__msg" data-tone="good">
            잘했어요! 이름을 듣고 대답했어요.
          </p>
          <button type="button" className="btn btn--soft" style={{ flex: 'none', minWidth: 240 }} onClick={call}>
            <Icon name="refresh" /> 다시 불러 보기
          </button>
        </>
      )}
    </div>
  );
}
