import type { ExamContent } from '../content/types';
import { RestButton } from './RestBreak';

/**
 * 단계 진행 표시. "언제 끝나요?"에 답함.
 * 칩 = 순서 화면(시안 m3)과 같은 묶음 번호·이름 (시안 m4 "4단계 엑스레이 촬영하기"), 오른쪽 = 전체 단계 중 몇 번째, 점 = 단계.
 */
export function Progress({ exam, index, checked }: { exam: ExamContent; index: number; checked: string[] }) {
  const total = exam.steps.length;
  const phaseIndex = exam.phases.findIndex((p) => p.id === exam.steps[index]?.phase);
  const phase = exam.phases[phaseIndex];
  return (
    <div
      className="progress"
      role="group"
      aria-label={`${phase ? `순서 ${phaseIndex + 1}번 ${phase.title}, ` : ''}${total}단계 중 ${index + 1}단계`}
    >
      <div className="progress__label">
        {phase && (
          <span className="step-chip">
            <span className="step-chip__num">{phaseIndex + 1}</span>
            {phase.title}
          </span>
        )}
        <span className="progress__right">
          <span>
            <strong>{index + 1}</strong> / {total}
          </span>
          {/* 쉬고 싶을 때 (2026-10-09). 줄 높이는 그대로 — 버튼이 위아래로 조금 넘침 (base.css .rest-btn) */}
          <RestButton />
        </span>
      </div>
      <div className="progress__dots" aria-hidden="true">
        {exam.steps.map((s, i) => (
          <span
            key={s.id}
            className="progress__dot"
            // "했어요"를 누른 단계만 "한 것" (단계 고르기로 건너뛴 단계는 안 한 것으로, 10-07 검수)
            data-state={i === index ? 'now' : checked.includes(s.id) ? 'done' : 'todo'}
          />
        ))}
      </div>
    </div>
  );
}
