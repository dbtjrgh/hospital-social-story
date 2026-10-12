// "심호흡" 연습 (PDF 정맥주사: 심호흡하기).
// [시작]을 누르면 동그라미가 천천히 커지며 "들이마셔요" → 작아지며 "내쉬어요". N번 반복하면 끝.
// 시간 압박 없음: 언제든 [멈추기], 다시 시작 가능. 움직임 줄이기면 크기는 그대로 두고 글자·진행 점으로만.
import { useEffect, useRef, useState } from 'react';
import { SpeakButton } from '../components/SpeakButton';
import { fx } from '../fx/fx';
import { devEvent } from '../lib/devlog';
import { playSynth } from '../lib/sound';
import { speak, stopSpeaking } from '../lib/speech';

/** 들이마시기·내쉬기 시간 (내쉬기를 조금 길게 → 마음이 가라앉음) */
const IN_MS = 3000;
const OUT_MS = 4000;
/** 시작하기 바로 뒤 같은 자리에 나오는 멈추기는 이 시간 동안 안 눌림 (빠르게 두 번 누르면 바로 멈췄음, 10-07 검수) */
const STOP_LOCK_MS = 700;

interface Props {
  count: number;
  prompt: string;
  success: string;
  onSuccess: () => void;
}

type Phase = 'idle' | 'in' | 'out' | 'done';

export function BreathePractice({ count, prompt, success, onSuccess }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  /** 끝낸 숨 횟수 */
  const [round, setRound] = useState(0);
  const timer = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const succeeded = useRef(false);
  const startedAt = useRef(0);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  const breatheIn = (r: number) => {
    setPhase('in');
    speak('들이마셔요');
    timer.current = window.setTimeout(() => breatheOut(r), IN_MS);
  };

  const breatheOut = (r: number) => {
    setPhase('out');
    speak('내쉬어요');
    timer.current = window.setTimeout(() => {
      const nextRound = r + 1;
      setRound(nextRound);
      if (nextRound < count) {
        breatheIn(nextRound);
        return;
      }
      setPhase('done');
      playSynth('chime');
      if (box.current) fx.celebrate(box.current, 8);
      if (!succeeded.current) {
        succeeded.current = true;
        devEvent(`연습 성공: 심호흡 ${count}번`);
        onSuccess();
      }
    }, OUT_MS);
  };

  const start = () => {
    window.clearTimeout(timer.current);
    setRound(0);
    startedAt.current = performance.now();
    devEvent('연습: 심호흡 시작');
    breatheIn(0);
  };

  const stop = () => {
    if (performance.now() - startedAt.current < STOP_LOCK_MS) return;
    window.clearTimeout(timer.current);
    stopSpeaking();
    setPhase('idle');
    setRound(0);
  };

  const running = phase === 'in' || phase === 'out';
  const message = phase === 'done' ? success : phase === 'in' ? '들이마셔요…' : phase === 'out' ? '내쉬어요…' : prompt;

  return (
    <div className="practice" ref={box} aria-live="polite">
      <div className="practice__say">
        <p className="practice__msg" data-tone={phase === 'done' ? 'good' : undefined}>
          {message}
        </p>
        {!running && <SpeakButton text={message} compact />}
      </div>

      <div className="breathe" data-phase={phase} style={{ ['--in' as string]: `${IN_MS}ms`, ['--out' as string]: `${OUT_MS}ms` }}>
        <div className="breathe__ball" aria-hidden="true" />
        <span className="breathe__word">{phase === 'in' ? '들이마셔요' : phase === 'out' ? '내쉬어요' : phase === 'done' ? '잘했어요' : '숨 쉬기'}</span>
      </div>

      <div className="breathe__dots" role="img" aria-label={`${count}번 중 ${round}번 했어요`}>
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className="breathe__dot" data-on={i < round} />
        ))}
      </div>

      {running ? (
        <button type="button" className="btn--line" onClick={stop}>
          멈추기
        </button>
      ) : (
        <button type="button" className="btn btn--soft" style={{ flex: 'none', minWidth: 220 }} onClick={start}>
          {phase === 'done' ? '한 번 더 하기' : '시작하기'}
        </button>
      )}
    </div>
  );
}
