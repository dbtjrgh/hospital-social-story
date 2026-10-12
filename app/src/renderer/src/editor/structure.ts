// 원고 구조 바꾸기 (편집 모드, CLAUDE.md 1-c ⑥단계): 단계 더하기·빼기·순서, 단계의 묶음(스티커) 바꾸기, 검사 켜기·끄기·순서.
// 화면 코드와 상관없는 순수 함수 → 자동 점검(tests/structure.spec.ts)에서 바로 시험.
// 지키는 것: 한 묶음의 단계는 늘 붙어 있고, 묶음 순서(phases)는 단계에 처음 나오는 차례와 같음, 단계가 없는 묶음은 없음
//   → 순서 화면·스티커판·스티커 받는 때가 원고 그대로 맞음
import type { ExamContent, Phase, Step } from '../content/types';

export class StructureError extends Error {}

export interface StepsAndPhases {
  steps: Step[];
  phases: Phase[];
  /** 바뀐 뒤 그 단계(새 단계·옮긴 단계)의 자리 */
  index: number;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** 묶음 순서를 단계에 처음 나오는 차례로 */
function orderPhases(steps: Step[], phases: Phase[]): Phase[] {
  const firstAt = (id: string) => steps.findIndex((s) => s.phase === id);
  return phases.filter((p) => firstAt(p.id) >= 0).sort((a, b) => firstAt(a.id) - firstAt(b.id));
}

/** 그 묶음의 단계가 놓인 자리 [처음, 끝] */
function blockOf(steps: Step[], phase: string): [number, number] {
  const first = steps.findIndex((s) => s.phase === phase);
  let last = first;
  while (last + 1 < steps.length && steps[last + 1].phase === phase) last += 1;
  return [first, last];
}

const soleInPhase = (steps: Step[], index: number) => steps.filter((s) => s.phase === steps[index].phase).length === 1;

/**
 * 위(-1)·아래(+1)로 옮기면 생기는 일
 *   swap  = 같은 묶음 안에서 옆 단계와 자리 바꾸기
 *   join  = 묶음 끝에 있어서 옆 묶음으로 들어감 (자리는 그대로)
 *   phase = 묶음에 이 단계뿐이라 묶음째 옆 묶음 앞·뒤로
 *   null  = 더 갈 곳 없음
 */
export type MoveKind = 'swap' | 'join' | 'phase';

export function moveKind(exam: ExamContent, index: number, dir: -1 | 1): MoveKind | null {
  const j = index + dir;
  if (j < 0 || j >= exam.steps.length) return null;
  if (exam.steps[j].phase === exam.steps[index].phase) return 'swap';
  return soleInPhase(exam.steps, index) ? 'phase' : 'join';
}

export function moveStep(exam: ExamContent, index: number, dir: -1 | 1): StepsAndPhases {
  const kind = moveKind(exam, index, dir);
  if (!kind) throw new StructureError(dir < 0 ? '맨 앞 단계예요' : '맨 뒤 단계예요');
  const steps = clone(exam.steps);
  const j = index + dir;
  let at = index;
  if (kind === 'swap') {
    [steps[index], steps[j]] = [steps[j], steps[index]];
    at = j;
  } else if (kind === 'join') {
    steps[index].phase = steps[j].phase;
  } else {
    // 묶음째: 옆 묶음 덩어리를 건너뜀
    const [first, last] = blockOf(steps, steps[j].phase);
    const [step] = steps.splice(index, 1);
    at = dir < 0 ? first : last; // 하나를 뺐으므로 뒤로 갈 때는 last 자리가 덩어리 바로 뒤
    steps.splice(at, 0, step);
  }
  return { steps, phases: orderPhases(steps, clone(exam.phases)), index: at };
}

/** 단계 id 새로 만들기: s1, s2 … 중 아직 없는 다음 번호 (진행 기록이 단계 id 로 남으므로 겹치면 안 됨) */
export function nextStepId(steps: Step[]): string {
  const used = new Set(steps.map((s) => s.id));
  let n = Math.max(0, ...steps.map((s) => Number(/^s(\d+)$/.exec(s.id)?.[1] ?? 0))) + 1;
  while (used.has(`s${n}`)) n += 1;
  return `s${n}`;
}

/** 새 단계의 처음 문장 (편집기에서 바로 고침) */
export const NEW_STEP_TEXT = '할 일을 한 문장으로 써 주세요.';

/** 이 단계 바로 뒤에 새 단계 (같은 묶음). 사진 자리는 <검사>/<새 id>.jpg (아직 없음 → "사진 준비 중") */
export function insertStep(exam: ExamContent, index: number): StepsAndPhases {
  const steps = clone(exam.steps);
  const id = nextStepId(steps);
  const base = steps[index];
  if (!base) throw new StructureError('단계를 넣을 자리가 없어요');
  steps.splice(index + 1, 0, { id, phase: base.phase, text: NEW_STEP_TEXT, image: `${exam.id}/${id}.jpg`, imageAlt: '새 단계 사진' });
  return { steps, phases: clone(exam.phases), index: index + 1 };
}

/** 단계 빼기. 묶음에 그 단계뿐이면 묶음(스티커)도 같이 빠짐. 마지막 하나는 못 뺌 */
export function removeStep(exam: ExamContent, index: number): StepsAndPhases & { removedPhase: Phase | null } {
  if (exam.steps.length <= 1) throw new StructureError('단계가 하나뿐이라 뺄 수 없어요');
  const steps = clone(exam.steps);
  const [gone] = steps.splice(index, 1);
  if (!gone) throw new StructureError('뺄 단계가 없어요');
  const empty = !steps.some((s) => s.phase === gone.phase);
  const phases = clone(exam.phases);
  const removedPhase = empty ? (phases.find((p) => p.id === gone.phase) ?? null) : null;
  return { steps, phases: orderPhases(steps, phases), index: Math.min(index, steps.length - 1), removedPhase };
}

/** 단계를 다른 묶음(스티커)으로: 그 묶음 덩어리의 가까운 끝에 붙임. 묶음에 이 단계뿐이면 못 옮김 (묶음이 비므로) */
export function setStepPhase(exam: ExamContent, index: number, phaseId: string): StepsAndPhases {
  const steps = clone(exam.steps);
  const step = steps[index];
  if (!step) throw new StructureError('단계가 없어요');
  if (step.phase === phaseId) return { steps, phases: clone(exam.phases), index };
  if (!exam.phases.some((p) => p.id === phaseId)) throw new StructureError('없는 묶음이에요');
  if (soleInPhase(steps, index)) {
    throw new StructureError('이 묶음에는 이 단계뿐이라 다른 묶음으로 옮길 수 없어요. 위·아래 버튼으로 묶음째 옮길 수 있어요');
  }
  steps.splice(index, 1);
  step.phase = phaseId;
  const [first, last] = blockOf(steps, phaseId);
  const at = first < index ? last + 1 : first;
  steps.splice(at, 0, step);
  return { steps, phases: orderPhases(steps, clone(exam.phases)), index: at };
}

// ───────── 검사 켜기·끄기·순서 (hospital.json 의 exams) ─────────

/** 켜면 맨 뒤에 붙음. 끌 때 하나도 안 남으면 못 끔 */
export function setExamOn(list: string[], id: string, on: boolean): string[] {
  if (on) return list.includes(id) ? [...list] : [...list, id];
  const out = list.filter((x) => x !== id);
  if (out.length === 0) throw new StructureError('검사가 하나는 있어야 해요');
  return out;
}

export function moveExam(list: string[], id: string, dir: -1 | 1): string[] {
  const i = list.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return [...list];
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
