// 원고 문장 그리기: {companion:와} 같은 토큰을 바꾸고, **핵심 낱말**에 형광펜을 칠함
// read: 읽어 주는 중이면 지금까지 읽은 글자 수 → 글자마다 나눠서, 읽은 글자만 검사 색으로 (노래방 자막처럼. base.css .rd)
import { Fragment, type ReactNode } from 'react';
import { fillTokens } from '../lib/josa';
import { useSettings } from '../lib/store';

export function useFill() {
  const { companion } = useSettings();
  return (text: string) => fillTokens(text, { companion });
}

/** 읽어 주기용: 강조 표시(**)를 뺀 문장 */
export function plain(text: string): string {
  return text.replace(/\*\*/g, '');
}

/** 글자를 하나씩 나눠 읽은 글자에 표시 (start = 이 조각이 문장에서 몇 번째 글자부터인지) */
function readChars(text: string, start: number, read: number): ReactNode[] {
  return Array.from(text, (ch, i) => (
    <span key={i} className={start + i < read ? 'rd rd--on' : 'rd'}>
      {ch}
    </span>
  ));
}

export function RichText({ text, read }: { text: string; read?: number }) {
  const fill = useFill();
  const parts = fill(text).split(/(\*\*[^*]+\*\*)/g);
  let at = 0; // 지금 조각이 문장에서 몇 번째 글자부터인지 (** 는 빼고 셈)
  return (
    <>
      {parts.map((part, i) => {
        const marked = part.startsWith('**') && part.endsWith('**');
        const body = marked ? part.slice(2, -2) : part;
        const start = at;
        at += body.length;
        const content = read === undefined ? body : readChars(body, start, read);
        return marked ? (
          <mark key={i} className="mark">
            {content}
          </mark>
        ) : (
          <Fragment key={i}>{content}</Fragment>
        );
      })}
    </>
  );
}

/** 강조 없는 문장을 읽는 대로 진하게 (예: 행동 문장 아래 설명) */
export function ReadText({ text, read }: { text: string; read?: number }) {
  return <>{read === undefined ? text : readChars(text, 0, read)}</>;
}
