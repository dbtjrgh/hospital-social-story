import { useState } from 'react';
import type { Sensory } from '../content/types';
import { playSound, SOUND_LEVELS } from '../lib/sound';
import { Icon, SENSE_ICON } from './Icon';
import { SpeakButton } from './SpeakButton';
import { useFill } from './RichText';

/** 미리 알아 두기: 차가움·조임·소리·빛을 겪기 전에 알려 줌. 소리는 작게 → 보통 → 크게 */
export function SenseCard({ sense }: { sense: Sensory }) {
  const fill = useFill();
  const [played, setPlayed] = useState<string | null>(null);
  /** 지금 소리가 나는(파일이 없으면 나는 척하는) 단계 → 막대가 움직임 */
  const [playing, setPlaying] = useState<string | null>(null);
  return (
    <div className="sense">
      <span className="sense__icon">
        <Icon name={SENSE_ICON[sense.kind]} />
      </span>
      <span className="sense__text">{fill(sense.text)}</span>
      <SpeakButton text={fill(sense.text)} compact />
      {sense.sound && (
        <div className="sense__sound">
          <span className="sense__sound-label">{sense.sound.label}</span>
          {SOUND_LEVELS.map((lv, i) => (
            <button
              key={lv.id}
              type="button"
              className="level-btn"
              aria-pressed={played === lv.id}
              data-playing={playing === lv.id}
              onClick={() => {
                setPlayed(lv.id);
                setPlaying(lv.id);
                // 다른 단계를 눌러 바뀐 뒤에 앞 소리가 끝나도 지금 것은 그대로
                playSound(sense.sound!, lv.level, () => setPlaying((p) => (p === lv.id ? null : p)));
              }}
            >
              <span className="bars" aria-hidden="true">
                {[0, 1, 2].map((b) => (
                  <i key={b} className={b <= i ? 'on' : ''} style={{ height: 6 + b * 5 }} />
                ))}
              </span>
              {lv.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
