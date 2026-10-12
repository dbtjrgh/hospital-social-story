// 보호자 메뉴(CaregiverSheet)와 초기 설정 창(SetupDialog)이 같이 쓰는 칸 이름·설명.
// 보호자에게 할 일을 알려 주는 말로 (본인 요청 2026-10-07). 한쪽만 고치면 두 화면 말이 달라지므로 여기서만 고침
import { fillTokens } from '../lib/josa';

/** "함께 가는 사람" 설명의 예시 문장: 고른 호칭을 원고와 같은 토큰·조사 규칙으로 바로 넣음 (본인 요청 10-08: 고를 때마다 바뀌게) */
export const companionExample = (companion: string) => fillTokens('{companion:와} 함께 가요', { companion });
export const NAME_LABEL = '아이 이름 (선택)';
export const NAME_HINT = '적어 두면 이름 부르기 연습과 축하 화면에서 이 이름으로 불러 줘요. 서버로 보내지 않아요';
export const NAME_PLACEHOLDER = '예: 홍길동';
