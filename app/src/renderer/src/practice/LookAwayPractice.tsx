// "볼 곳 고르기" 연습 (채혈: 따끔할 때 다른 곳 보기 — 대처 기술. 본인 선택 2026-10-07).
// 볼 것(풍선·별·엄마/아빠 등)을 고르면 그 그림이 동그라미 안에 크게 뜨고, 동그라미가 차는 동안 "하나, 둘…" 같이 셈.
// 기다리는 동안 누를 것 없음 (운동 부담 없음). 멈출 수 있고, 다른 것을 골라 다시 해도 됨. 실패 없음.
import { useEffect, useRef, useState } from 'react';
import { Icon, isIconName } from '../components/Icon';
import { useFill } from '../components/RichText';
import { SpeakButton } from '../components/SpeakButton';
import { fx } from '../fx/fx';
import { asset } from '../lib/asset';
import { devEvent } from '../lib/devlog';
import { withJosa } from '../lib/josa';
import { playSynth } from '../lib/sound';
import { speak, stopSpeaking } from '../lib/speech';

const COUNT_WORDS = ['하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];

interface Choice {
  label: string;
  image?: string;
  icon?: string;
}

interface Props {
  seconds: number;
  choices: Choice[];
  prompt: string;
  success: string;
  onSuccess: () => void;
}

type Stage = 'choose' | 'look' | 'done';

function ChoicePicture({ choice }: { choice: Choice }) {
  if (choice.image) return <img src={asset(choice.image)} alt="" draggable={false} />;
  return <Icon name={isIconName(choice.icon) ? choice.icon : 'star'} />;
}

export function LookAwayPractice({ seconds, choices, prompt, success, onSuccess }: Props) {
  const fill = useFill();
  const [stage, setStage] = useState<Stage>('choose');
  const [chosen, setChosen] = useState(0);
  const [progress, setProgress] = useState(0);
  const raf = useRef(0);
  const startAt = useRef(0);
  const spoken = useRef(0);
  const view = useRef<HTMLDivElement>(null);
  const succeeded = useRef(false);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const name = fill(choices[chosen]?.label ?? '');

  const tick = () => {
    const elapsed = performance.now() - startAt.current;
    const p = Math.min(1, elapsed / (seconds * 1000));
    setProgress(p);
    const n = Math.min(seconds, Math.floor(elapsed / 1000) + 1);
    if (p < 1 && n !== spoken.current) {
      spoken.current = n;
      speak(COUNT_WORDS[n - 1] ?? String(n));
    }
    if (p >= 1) {
      setStage('done');
      playSynth('chime');
      if (view.current) fx.celebrate(view.current, 8);
      if (!succeeded.current) {
        succeeded.current = true;
        devEvent(`연습 성공: 다른 곳 보며 ${seconds}초`);
        onSuccess();
      }
      return;
    }
    raf.current = requestAnimationFrame(tick);
  };

  const look = (index: number) => {
    cancelAnimationFrame(raf.current);
    setChosen(index);
    setProgress(0);
    setStage('look');
    spoken.current = 0;
    startAt.current = performance.now();
    raf.current = requestAnimationFrame(tick);
    devEvent(`연습: 볼 곳 고름 (${fill(choices[index].label)})`);
  };

  const stop = () => {
    cancelAnimationFrame(raf.current);
    stopSpeaking();
    setStage('choose');
    setProgress(0);
  };

  const shown = Math.min(seconds, Math.floor(progress * seconds) + 1);
  const message =
    stage === 'choose' ? prompt : stage === 'done' ? success : `${withJosa(name, '을')} 보며 같이 세어요.`;
  const R = 90;
  const C = 2 * Math.PI * R;

  return (
    <div className="practice" aria-live="polite">
      <div className="practice__say">
        <p className="practice__msg" data-tone={stage === 'done' ? 'good' : undefined}>
          {message}
        </p>
        {stage !== 'look' && <SpeakButton text={message} compact />}
      </div>

      {stage === 'choose' ? (
        <div className="look__choices">
          {choices.map((c, i) => (
            <button key={c.label} type="button" className="look__choice" onClick={() => look(i)}>
              <span className="look__pic">
                <ChoicePicture choice={c} />
              </span>
              <span>{fill(c.label)}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div ref={view} className="look__view" data-state={stage}>
            <svg className="look__ring" viewBox="0 0 196 196" aria-hidden="true">
              <circle cx="98" cy="98" r={R} fill="none" stroke="var(--accent-line)" strokeWidth="10" />
              <circle
                cx="98"
                cy="98"
                r={R}
                fill="none"
                stroke={stage === 'done' ? 'var(--success)' : 'var(--accent)'}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - (stage === 'done' ? 1 : progress))}
              />
            </svg>
            <span className="look__pic look__pic--big" role="img" aria-label={`${name} 보기`}>
              <ChoicePicture choice={choices[chosen]} />
            </span>
            {/* 지금 몇까지 셌는지 (1부터 올라감, 가만히 있기와 같은 방향) */}
            {stage === 'look' && <span className="look__count">{shown}</span>}
          </div>
          {stage === 'look' ? (
            <button type="button" className="btn--line" onClick={stop}>
              멈추기
            </button>
          ) : (
            <button type="button" className="btn--line" onClick={() => setStage('choose')}>
              다른 것 골라 보기
            </button>
          )}
        </>
      )}
    </div>
  );
}
