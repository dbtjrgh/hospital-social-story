// "부위 고르기" 연습 (PDF 복부 초음파: 검사 부위를 선택하고 젤이 닿는 느낌을 듣기).
// 몸 그림에서 검사할 곳을 누르면 → 그 자리에 젤이 생기고, 젤 소리와 느낌 문장을 들려줌.
// 오류 없는 학습: 다른 곳을 눌러도 실패 소리·빨간 표시 없이 "여기는 팔이에요. 배를 눌러 봐요." + 맞는 곳이 부드럽게 빛남.
import { useEffect, useRef, useState } from 'react';
import type { BodyPart, SoundRef } from '../content/types';
import { FeelBox } from '../components/FeelBox';
import { SpeakButton } from '../components/SpeakButton';
import { fx } from '../fx/fx';
import { devEvent } from '../lib/devlog';
import { hasBatchim, withJosa } from '../lib/josa';
import { playSound, SOUND_LEVELS } from '../lib/sound';
import { speak } from '../lib/speech';
import { BODY_CENTER, BODY_LABEL, BodyFigure } from './BodyFigure';

/** 젤 소리가 난 뒤 느낌 문장을 읽기까지 */
const FEEL_DELAY_MS = 700;

interface Props {
  target: BodyPart;
  prompt: string;
  success: string;
  feel?: { text: string; sound?: SoundRef };
  bareBelly?: boolean;
  onSuccess: () => void;
}

const isIt = (word: string) => `${word}${hasBatchim(word) ? '이에요' : '예요'}`;

export function TapAreaPractice({ target, prompt, success, feel, bareBelly, onSuccess }: Props) {
  const [stage, setStage] = useState<'idle' | 'hint' | 'done'>('idle');
  const [tapped, setTapped] = useState<BodyPart | null>(null);
  /** 맞는 곳을 찾았는지. 그 뒤 다른 곳을 눌러도 젤·느낌은 남기고 안내 글만 바꿈 (2026-10-07 검수) */
  const [found, setFound] = useState(false);
  const figure = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  /** 성공은 한 번만 알림 (다시 눌러 느낌을 또 들어도 됨) */
  const succeeded = useRef(false);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onPart = (part: BodyPart) => {
    window.clearTimeout(timer.current);
    if (part !== target) {
      setTapped(part);
      setStage('hint');
      devEvent(`연습: ${withJosa(BODY_LABEL[part], '를')} 눌러 다시 안내`);
      return;
    }
    setStage('done');
    setFound(true);
    // 누른 것에 대한 반응으로만 소리 (작게 시작) → 느낌 문장
    if (feel?.sound) playSound(feel.sound, SOUND_LEVELS[0].level);
    if (feel) timer.current = window.setTimeout(() => speak(feel.text), feel.sound ? FEEL_DELAY_MS : 0);
    if (!succeeded.current) {
      succeeded.current = true;
      if (figure.current) fx.celebrate(figure.current, 8);
      devEvent(`연습 성공: ${BODY_LABEL[target]} 고르기`);
      onSuccess();
    }
  };

  const targetWord = BODY_LABEL[target];
  const message =
    stage === 'done'
      ? success
      : stage === 'hint' && tapped
        ? `여기는 ${isIt(BODY_LABEL[tapped])}. ${withJosa(targetWord, '를')} 눌러 봐요.`
        : prompt;
  const center = BODY_CENTER[target];

  return (
    <div className="practice" aria-live="polite">
      <div className="practice__say">
        <p className="practice__msg" data-tone={stage === 'done' ? 'good' : stage === 'hint' ? 'calm' : undefined}>
          {message}
        </p>
        <SpeakButton text={message} compact />
      </div>

      <div className="tap-area" ref={figure}>
        <BodyFigure
          label={`몸 그림. ${withJosa(targetWord, '를')} 찾아 눌러요`}
          onPart={onPart}
          hint={stage === 'hint' ? target : null}
          bareBelly={bareBelly}
        >
          {found && (
            // 젤: 투명하고 반짝이는 물방울 (누를 수 없게 — 다시 누르면 아래 부위가 받음)
            <g className="tap-area__gel" pointerEvents="none">
              <ellipse cx={center.x} cy={center.y} rx="28" ry="15" fill="#bfe8ff" opacity="0.75" />
              <ellipse cx={center.x - 8} cy={center.y - 5} rx="9" ry="4" fill="#ffffff" opacity="0.85" />
              <circle cx={center.x + 16} cy={center.y + 4} r="3" fill="#ffffff" opacity="0.9" />
            </g>
          )}
        </BodyFigure>
      </div>

      {found && feel && <FeelBox text={feel.text} />}
    </div>
  );
}
