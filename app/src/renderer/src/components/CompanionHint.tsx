// "함께 가는 사람" 칸 설명: 고른 호칭이 들어간 예시 문장을 바로 보여 줌 (보호자 메뉴·초기 설정 창 공통)
import { companionExample } from './settingHints';

export function CompanionHint({ companion }: { companion: string }) {
  return (
    <span className="field__hint" aria-live="polite">
      병원에 같이 갈 분을 골라 주세요. 연습 문장에 "<b>{companionExample(companion)}</b>"처럼 나와요
    </span>
  );
}
