// "가만히 있기" 연습: 동그라미를 손가락으로 꾹 누르고 N초 동안 움직이지 않기.
// 몸으로 연결: 손가락이 크게 움직이거나 떼면 부드럽게 다시 시작 (실패 소리·빨간 표시 없음).
// 숫자는 늘 1부터 올라감 (보호자 팁의 "하나, 둘, 셋"과 같은 방향. 2026-10-06 최종 검토: 연습마다 줄었다 늘었다 하던 것을 통일)
// 원고 옵션: figure 'arm' = 동그라미 안에 쭉 편 팔 그림 (채혈) / countAloud = "하나, 둘, 셋…" 소리 내어 읽어 줌 / feel = 성공하면 느낌 듣기
// freeze = "얼음!" 놀이 말로 안내 / photo 'chest' = 성공하면 동그라미 안에 내 가슴 사진(그림) (엑스레이 — 본인 선택 2026-10-07:
// 누르고만 있는 것보다 '움직이지 않기'에 가깝게, 찍으면 사진이 나온다는 결과를 미리 봄. 찰칵 소리는 내지 않음 — 놀랄 수 있는 소리는 자동으로 안 틂)
import { useEffect, useRef, useState } from 'react';
import type { SoundRef } from '../content/types';
import { fx } from '../fx/fx';
import { devEvent } from '../lib/devlog';
import { playSound, playSynth, SOUND_LEVELS } from '../lib/sound';
import { speak, stopSpeaking } from '../lib/speech';
import { FeelBox } from '../components/FeelBox';
import { Icon } from '../components/Icon';
import { SpeakButton } from '../components/SpeakButton';

const COUNT_WORDS = ['하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
const FEEL_DELAY_MS = 900;

/** 손가락이 동그라미 밖으로 이만큼(px)까지 나가도 계속 셈. 예전에는 누른 자리에서 40px만 움직여도 다시였는데,
 * 몇 초 누르는 동안 손가락이 조금씩 밀려 자꾸 풀려서(본인 지적 2026-10-07) → 동그라미 위에만 있으면 됨 */
const EDGE_MARGIN = 40;

type State = 'idle' | 'holding' | 'retry' | 'moved' | 'done';

interface Props {
  seconds: number;
  prompt: string;
  success: string;
  countAloud?: boolean;
  figure?: 'arm';
  feel?: { text: string; sound?: SoundRef };
  freeze?: boolean;
  photo?: 'chest';
  onSuccess: () => void;
}

/** 쭉 편 팔 (받침대 위). 동그라미 안에 그려 "팔을 펴고 가만히"와 연결 */
function ArmFigure() {
  return (
    <svg className="hold__arm" viewBox="0 0 120 56" aria-hidden="true">
      <rect x="2" y="38" width="116" height="10" rx="5" fill="#e6dbd4" />
      <rect x="4" y="13" width="34" height="27" rx="10" fill="var(--accent-line)" />
      <rect x="32" y="19" width="66" height="16" rx="8" fill="#f6d7c3" />
      <circle cx="102" cy="27" r="11" fill="#f6d7c3" />
    </svg>
  );
}

/** 내 가슴 사진 (엑스레이 결과를 아이 눈높이로: 어두운 바탕에 폐 두 개와 갈비뼈. 무섭지 않게 단순하게) */
function ChestPhoto() {
  return (
    <svg className="hold__photo" viewBox="0 0 100 90" aria-hidden="true">
      <rect x="1" y="1" width="98" height="88" rx="12" fill="#1f3355" />
      <path d="M26 16 Q50 9 74 16" stroke="#c9d8ee" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M45 22 C30 20 18 38 19 60 C20 74 34 76 44 70 C47 56 47 36 45 22 Z" fill="#8fb0d8" opacity="0.75" />
      <path d="M55 22 C70 20 82 38 81 60 C80 74 66 76 56 70 C53 56 53 36 55 22 Z" fill="#8fb0d8" opacity="0.75" />
      <g stroke="#e3ecf8" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.8">
        <path d="M24 34 Q35 29 46 33" /><path d="M76 34 Q65 29 54 33" />
        <path d="M22 45 Q34 40 46 44" /><path d="M78 45 Q66 40 54 44" />
        <path d="M22 56 Q34 51 46 55" /><path d="M78 56 Q66 51 54 55" />
      </g>
      <rect x="48" y="14" width="4" height="64" rx="2" fill="#e3ecf8" />
    </svg>
  );
}

export function HoldPractice({ seconds, prompt, success, countAloud, figure, feel, freeze, photo, onSuccess }: Props) {
  const [state, setState] = useState<State>('idle');
  const [progress, setProgress] = useState(0);
  const raf = useRef(0);
  const startAt = useRef(0);
  const button = useRef<HTMLButtonElement>(null);
  const stateRef = useRef<State>('idle');
  stateRef.current = state;
  /** 마지막으로 읽어 준 숫자 (1부터) */
  const spoken = useRef(0);
  const feelTimer = useRef(0);
  /** 한 번 해냈는지. 그 뒤 다시 해 보다 멈추면 "다시 얼음!" 대신 성공 화면으로 돌아감
   * (성공 사진을 톡 만졌을 뿐인데 실패한 것처럼 보였음 — 2026-10-07 검수) */
  const succeededOnce = useRef(false);

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      window.clearTimeout(feelTimer.current);
    },
    [],
  );

  // 연습하는 동안 나머지 화면을 살짝 가려 연습에 집중
  useEffect(() => {
    fx.setSpotlight(state === 'holding' ? button.current?.parentElement ?? null : null);
    return () => fx.setSpotlight(null);
  }, [state]);

  const tick = () => {
    const elapsed = performance.now() - startAt.current;
    const p = Math.min(1, elapsed / (seconds * 1000));
    setProgress(p);
    if (countAloud && p < 1) {
      const n = Math.min(seconds, Math.floor(elapsed / 1000) + 1);
      if (n !== spoken.current) {
        spoken.current = n;
        speak(COUNT_WORDS[n - 1] ?? String(n));
      }
    }
    if (p >= 1) {
      setState('done');
      playSynth('chime');
      if (button.current) fx.celebrate(button.current, 8);
      if (feel) {
        window.clearTimeout(feelTimer.current);
        feelTimer.current = window.setTimeout(() => {
          if (feel.sound) playSound(feel.sound, SOUND_LEVELS[0].level);
          speak(feel.text);
        }, FEEL_DELAY_MS);
      }
      devEvent(`연습 성공: ${seconds}초 가만히`);
      succeededOnce.current = true;
      onSuccess();
      return;
    }
    raf.current = requestAnimationFrame(tick);
  };

  const begin = () => {
    cancelAnimationFrame(raf.current);
    spoken.current = 0;
    window.clearTimeout(feelTimer.current);
    startAt.current = performance.now();
    setProgress(0);
    setState('holding');
    raf.current = requestAnimationFrame(tick);
  };

  const stop = (reason: 'retry' | 'moved') => {
    if (stateRef.current !== 'holding') return;
    cancelAnimationFrame(raf.current);
    if (countAloud) stopSpeaking();
    setProgress(0);
    if (succeededOnce.current) {
      setState('done');
      devEvent('연습: 성공한 뒤 다시 해 보다 멈춤 → 성공 화면 그대로');
      return;
    }
    setState(reason);
    devEvent(reason === 'moved' ? '연습: 손가락이 움직여 다시 시작' : '연습: 중간에 떼서 다시 시작');
  };

  /** 지금 몇 초째인지 (1부터 올라감) */
  const shown = Math.min(seconds, Math.floor(progress * seconds) + 1);
  const R = 90;
  const C = 2 * Math.PI * R;

  const message =
    state === 'holding'
      ? (freeze ? '얼음! 가만히…' : '좋아요, 가만히…')
      : state === 'done'
        ? success
        : state === 'moved' || state === 'retry'
          ? (freeze ? '괜찮아요. 다시 얼음!' : '괜찮아요. 다시 꾹 눌러 봐요.')
          : prompt;

  return (
    <div className="practice" aria-live="polite">
      <div className="practice__say">
        <p className="practice__msg" data-tone={state === 'done' ? 'good' : state === 'retry' || state === 'moved' ? 'calm' : undefined}>
          {message}
        </p>
        <SpeakButton text={message} compact />
      </div>
      <button
        ref={button}
        type="button"
        className="hold"
        data-state={state}
        aria-label={`${seconds}초 동안 누르고 있기 연습`}
        onPointerDown={(e) => {
          try {
            e.currentTarget.setPointerCapture(e.pointerId); // 손가락이 살짝 밖으로 나가도 계속 셈
          } catch {
            // 일부 브라우저는 캡처를 막음 → 그래도 연습은 진행
          }
          begin();
        }}
        onPointerMove={(e) => {
          // 동그라미 가운데에서 (반지름 + EDGE_MARGIN) 밖으로 나가면 다시 (키보드로 누르는 중 마우스가 위를 지나가도 풀리지 않음)
          const r = e.currentTarget.getBoundingClientRect();
          const off = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
          if (off > r.width / 2 + EDGE_MARGIN) stop('moved');
        }}
        onPointerUp={() => stop('retry')}
        onPointerCancel={() => stop('retry')}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
            e.preventDefault();
            begin();
          }
        }}
        onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && stop('retry')}
      >
        <svg className="ring" viewBox="0 0 196 196" aria-hidden="true">
          <circle cx="98" cy="98" r={R} fill="none" stroke="var(--accent-line)" strokeWidth="10" />
          <circle
            cx="98"
            cy="98"
            r={R}
            fill="none"
            stroke={state === 'done' ? 'var(--success)' : 'var(--accent)'}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - (state === 'done' ? 1 : progress))}
          />
        </svg>
        <span className="hold__center">
          {state === 'holding' ? (
            <>
              {figure === 'arm' && <ArmFigure />}
              <span className="hold__num">{shown}</span>
            </>
          ) : state === 'done' ? (
            photo === 'chest' ? (
              <>
                <ChestPhoto />
                <span className="hold__hint">내 가슴 사진</span>
              </>
            ) : (
              <>
                <span className="hold__num">
                  <Icon name="check" className="finger" />
                </span>
                <span className="hold__hint">한 번 더 해도 돼요</span>
              </>
            )
          ) : (
            <>
              {figure === 'arm' ? <ArmFigure /> : <Icon name="hand" className="finger" />}
              <span className="hold__hint">{freeze ? '손가락 대고 얼음!' : '꾹 누르기'}</span>
            </>
          )}
        </span>
      </button>

      {state === 'done' && feel && <FeelBox text={feel.text} />}
    </div>
  );
}
