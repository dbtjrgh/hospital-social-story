// 호칭(엄마/아빠, 선생님 …)에 맞는 조사를 붙입니다. "엄마/아빠와" / "선생님과"
const PAIRS: Record<string, [string, string]> = {
  와: ['와', '과'],
  과: ['와', '과'],
  가: ['가', '이'],
  이: ['가', '이'],
  는: ['는', '은'],
  은: ['는', '은'],
  를: ['를', '을'],
  을: ['를', '을'],
};

export function hasBatchim(word: string): boolean {
  const code = word.trim().slice(-1).charCodeAt(0) - 0xac00;
  if (Number.isNaN(code) || code < 0 || code > 11171) return false;
  return code % 28 !== 0;
}

export function withJosa(word: string, particle: string): string {
  const pair = PAIRS[particle];
  if (!pair) return word + particle;
  return word + (hasBatchim(word) ? pair[1] : pair[0]);
}

/** 원고의 {companion} / {companion:와} 토큰을 설정값으로 바꿈 */
export function fillTokens(text: string, values: { companion: string }): string {
  return text.replace(/\{companion(?::([^}]+))?\}/g, (_m, particle?: string) =>
    particle ? withJosa(values.companion, particle) : values.companion,
  );
}
