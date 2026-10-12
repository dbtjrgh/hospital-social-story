// 원고 규칙 — 원고 검사기(tools/check.mjs)와 편집기(문장 고치기·연습 숫자·내보내기 점검)가 같이 씀.
// Node 가 이 파일을 그대로 읽으므로(타입만 지우고 실행 — Node 22.18+) 타입 말고 다른 TS 문법(enum 등)이나
// 다른 모듈 불러오기는 쓰지 않음.

/** 거짓 약속·부정 명령 (docs/design-principles.md). 화면에 보이는 모든 글에서 찾음 */
export const BANNED: { re: RegExp; why: string }[] = [
  { re: /안\s*아파|아프지\s*않/, why: '거짓 약속 ("따끔할 수 있어요, 금방 끝나요"처럼)' },
  { re: /절대/, why: '강한 금지 표현' },
  { re: /하지\s*마/, why: '부정 명령 → 해야 할 행동으로 ("가만히 있어요")' },
  { re: /무서워하지|울지\s*마/, why: '감정을 막는 말' },
];

/** 문장 하나의 문제 (없으면 빈 목록): 쓰면 안 되는 표현, 형광펜 표시 ** 짝 */
export function textProblems(text: string): string[] {
  const out: string[] = [];
  for (const b of BANNED) if (b.re.test(text)) out.push(b.why);
  if ((text.match(/\*\*/g) ?? []).length % 2) out.push('형광펜 표시 ** 짝이 안 맞음');
  return out;
}

/** 연습 숫자의 범위 (화면이 무리 없이 그리는 만큼) */
export const PRACTICE_LIMITS = {
  /** 가만히 있기(hold)·볼 곳 고르기(lookAway)의 초 */
  seconds: { min: 1, max: 10 },
  /** 심호흡(breathe) 횟수 */
  count: { min: 1, max: 5 },
};
