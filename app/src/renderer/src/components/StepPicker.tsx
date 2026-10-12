// 보호자 메뉴 "단계 고르기" (본인 요청 2026-10-07): 원하는 단계로 바로 가기 + 처음부터 다시 연습하기.
// 아이 화면(위 막대)에는 두지 않음 — 아이가 실수로 눌러 단계를 건너뛰지 않게, "첫 화면" 버튼과 이름이 헷갈리지 않게.
// 평소에는 접혀 있어 메뉴가 길어지지 않음.
// 직접 해 보는 연습이 있는 단계는 연습 화면처럼 점선 테두리 + "○○ 연습" 표시 (본인 요청 2026-10-07: 연습 단계를 골라 가기 쉽게)
import type { ExamContent, Practice, Step } from '../content/types';
import { navigate } from '../lib/router';
import { restartExam, startRound, useProgress } from '../lib/store';
import { Icon } from './Icon';
import { plain, useFill } from './RichText';

/** 연습 종류 이름 (보호자가 보는 글, 편집기도 씀) */
export const PRACTICE_NAME: Record<Practice['type'], string> = {
  hold: '가만히 있기',
  nameCall: '이름 부르기',
  tapArea: '부위 고르기',
  placePads: '패드 붙이기',
  sequence: '순서 고르기',
  breathe: '심호흡',
  lookAway: '볼 곳 고르기',
};

export function StepPicker({ exam, current, onPick }: { exam: ExamContent; current?: Step; onPick: () => void }) {
  const { checked } = useProgress(exam.id);
  const fill = useFill();

  const go = (page: number) => {
    onPick();
    navigate({ name: 'exam', examId: exam.id, page });
  };

  /** 단계로 가기: 다 마친 검사면 표지 "시작하기"처럼 새 회차로 (체크·스티커·연습을 비우고 마친 횟수는 남김).
   * 그대로 두면 끝까지 다시 해도 스티커 창이 안 뜨고 마친 횟수도 안 올랐음 (2026-10-07 검수). 하던 검사는 기록을 두고 감 */
  const goStep = (page: number) => {
    startRound(exam);
    go(page);
  };

  const restart = () => {
    // 스티커판 "다시 연습하기"와 같음: 체크·스티커만 비우고 마친 횟수는 남김 → 순서 화면부터
    if (!window.confirm('체크와 스티커를 비우고 처음부터 다시 할까요?')) return;
    restartExam(exam.id);
    go(1);
  };

  return (
    <details className="step-pick">
      <summary>
        <Icon name="list" /> 단계 고르기
        <span className="step-pick__count">{exam.steps.length}단계</span>
      </summary>
      <button type="button" className="btn--line step-pick__restart" onClick={restart}>
        <Icon name="refresh" /> 처음부터 다시 연습하기
      </button>
      <p className="step-pick__note">체크와 스티커를 비우고 순서 화면부터 다시 해요 (연습 횟수는 남아요). 하던 기록을 두고 가려면 아래에서 단계를 고르세요 (다 마친 검사는 새로 시작해요).</p>
      {exam.phases.map((phase, pi) => {
        const steps = exam.steps.map((s, i) => ({ s, i })).filter(({ s }) => s.phase === phase.id);
        if (!steps.length) return null;
        return (
          <div key={phase.id} className="step-pick__group">
            <h4>
              <b>{pi + 1}</b>
              {phase.title}
            </h4>
            <ul>
              {steps.map(({ s, i }) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="step-pick__item"
                    data-practice={!!s.practice}
                    aria-current={s === current ? 'step' : undefined}
                    onClick={() => goStep(i + 2)}
                  >
                    <span className="step-pick__num">{i + 1}</span>
                    <span className="step-pick__text">
                      {plain(fill(s.text))}
                      {s.practice && (
                        <span className="step-pick__practice">
                          <Icon name="hand" /> {PRACTICE_NAME[s.practice.type]} 연습
                        </span>
                      )}
                    </span>
                    {s === current ? (
                      <span className="step-pick__now">지금</span>
                    ) : (
                      checked.includes(s.id) && <Icon name="check" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </details>
  );
}
