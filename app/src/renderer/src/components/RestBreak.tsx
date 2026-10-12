// "쉬고 싶어요" (docs/design-principles.md 5장 "쉬어도 됨", 2026-10-09).
// 단계 화면의 진행 표시 줄 오른쪽 작은 버튼 → 쉬는 창: 풍선이 천천히 커졌다(들이마셔요 3초) 작아짐(내쉬어요 4초)을 되풀이.
// 해내야 할 것·횟수·성공 소리 없음 (연습이 아님). "다시 할래요"·Esc·뒤로 가기로 닫으면 보던 단계 그대로.
// 소리는 누른 데 대한 반응으로만: 자동 읽기를 켰으면 열 때 한 번 안내 말. 움직임 줄이기면 풍선은 색으로만 (base.css .breathe)
import { useEffect, useState } from 'react';
import { devEvent } from '../lib/devlog';
import { stopExamSound } from '../lib/sound';
import { speak, stopSpeaking } from '../lib/speech';
import { getState } from '../lib/store';
import { useTapGuard } from '../lib/tapGuard';
import { Icon } from './Icon';
import { Overlay } from './Overlay';
import { SpeakButton } from './SpeakButton';

const IN_MS = 3000;
const OUT_MS = 4000;
const SAY = '잠깐 쉬어요. 풍선을 보면서 천천히 숨을 쉬어 봐요. 다시 하고 싶으면 다시 할래요를 눌러요.';

function RestBreak({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const guard = useTapGuard();

  useEffect(() => {
    stopSpeaking();
    stopExamSound();
    // 빛 고리·손가락은 창이 떠 있는 동안 저절로 멈춤 (Overlay → fx.setModal)
    if (getState().settings.readAloud) speak(SAY);
    return () => stopSpeaking();
  }, []);

  // 들이마셔요 → 내쉬어요 를 계속 (끝이 없음, 닫을 때까지)
  useEffect(() => {
    const t = window.setTimeout(() => setPhase((p) => (p === 'in' ? 'out' : 'in')), phase === 'in' ? IN_MS : OUT_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  return (
    <Overlay label="쉬는 시간" onClose={onClose}>
      <div className="rest">
        <div className="page-head">
          <div>
            <h2>잠깐 쉬어요</h2>
            <p>쉬고 싶을 때는 쉬어도 돼요.</p>
          </div>
          <SpeakButton text={SAY} />
        </div>
        <div className="breathe" data-phase={phase} style={{ ['--in' as string]: `${IN_MS}ms`, ['--out' as string]: `${OUT_MS}ms` }}>
          <div className="breathe__ball" aria-hidden="true" />
          <span className="breathe__word" aria-live="polite">
            {phase === 'in' ? '들이마셔요' : '내쉬어요'}
          </span>
        </div>
        <p className="rest__hint">풍선을 보면서 천천히 숨을 쉬어 봐요</p>
        <button type="button" className="btn btn--primary" onClick={guard(onClose)}>
          <Icon name="play" /> 다시 할래요
        </button>
      </div>
    </Overlay>
  );
}

/** 단계 화면의 "쉬고 싶어요" 버튼 + 쉬는 창 */
export function RestButton() {
  const [open, setOpen] = useState(false);
  const guard = useTapGuard();
  return (
    <>
      <button
        type="button"
        className="rest-btn"
        onClick={guard(() => {
          devEvent('쉬고 싶어요 누름');
          setOpen(true);
        })}
      >
        <Icon name="pause" />
        쉬고 싶어요
      </button>
      {open && (
        <RestBreak
          onClose={() => {
            devEvent('쉬기 끝 (다시 할래요)');
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
