import { useEffect } from 'react';
import { getReading, speak, stopSpeaking, useIsSpeaking } from '../lib/speech';
import { Icon } from './Icon';

/**
 * 들어보기. 누르면 읽고, 다시 누르면 멈춤. 페이지에 들어설 때 자동으로 읽는 중에도 같이 움직임 (같은 문장이면).
 * 다 읽으면 바로 빛 고리 (cue). compact = 글자 없이 🔊만 (감각 카드·연습 안내 옆)
 */
export function SpeakButton({
  text,
  audio,
  label = '들어보기',
  compact = false,
}: {
  text: string;
  audio?: string;
  label?: string;
  compact?: boolean;
}) {
  const speaking = useIsSpeaking(text);

  // 이 버튼이 사라질 때 이 문장을 읽고 있었으면 멈춤
  useEffect(
    () => () => {
      if (getReading()?.text === text) stopSpeaking();
    },
    [text],
  );

  const onClick = () => {
    if (speaking) stopSpeaking();
    else speak(text, { audio, cue: true });
  };

  return (
    <button
      type="button"
      className={compact ? 'speak-btn speak-btn--compact' : 'speak-btn'}
      data-speaking={speaking}
      onClick={onClick}
      aria-label={speaking ? '읽기 멈추기' : `${label}: ${text}`}
    >
      <Icon name="speaker" />
      {!compact && (speaking ? '멈춤' : label)}
    </button>
  );
}
