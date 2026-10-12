// 편집기 ⑥단계: 원고 구조 바꾸기(editor/structure.ts)와 문장 규칙(content/rules.ts) 점검. 화면 없이 바로 돎.
// 브라우저 화면 크기와 상관없으므로 첫 번째 크기(프로젝트)에서만 한 번 돌림
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { textProblems } from '../src/renderer/src/content/rules';
import type { ExamContent } from '../src/renderer/src/content/types';
import { insertStep, moveExam, moveKind, moveStep, nextStepId, removeStep, setExamOn, setStepPhase, StructureError } from '../src/renderer/src/editor/structure';

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== info.config.projects[0].name, '브라우저와 상관없는 점검이라 한 번만');
});

const HOSPITAL = join(process.cwd(), '..', 'hospitals', process.env.HOSPITAL || 'SampleHospital');

/** 묶음 a(1,2) b(3) c(4,5) 인 작은 원고 */
function sample(): ExamContent {
  const step = (id: string, phase: string) => ({ id, phase, text: id, imageAlt: id });
  return {
    id: 'xray',
    order: 1,
    title: '시험',
    theme: 'blue',
    source: 'draft',
    cover: { image: 'x.jpg', imageAlt: 'x', lead: 'x' },
    caregiver: { before: [], tips: [] },
    phases: ['a', 'b', 'c'].map((id) => ({ id, title: id.toUpperCase(), sticker: `${id}.png` })),
    steps: [step('s1', 'a'), step('s2', 'a'), step('s3', 'b'), step('s4', 'c'), step('s5', 'c')],
    reward: { message: '잘했어요' },
  };
}

const order = (r: { steps: { id: string; phase: string }[] }) => r.steps.map((s) => `${s.id}${s.phase}`).join(' ');
const phaseOrder = (r: { phases: { id: string }[] }) => r.phases.map((p) => p.id).join('');

/** 지켜야 할 것: 한 묶음의 단계는 붙어 있고, 묶음 순서 = 단계에 처음 나오는 차례, 빈 묶음 없음 */
function expectValid(r: { steps: { phase: string }[]; phases: { id: string }[] }) {
  const seen: string[] = [];
  for (const s of r.steps) if (seen[seen.length - 1] !== s.phase) seen.push(s.phase);
  expect(new Set(seen).size, '묶음이 떨어져 있음').toBe(seen.length);
  expect(seen).toEqual(r.phases.map((p) => p.id));
}

test('단계 옮기기: 같은 묶음은 자리 바꾸기, 묶음 끝은 옆 묶음으로, 혼자인 단계는 묶음째', () => {
  const exam = sample();
  expect(moveKind(exam, 0, -1)).toBeNull();
  expect(moveKind(exam, 1, -1)).toBe('swap');
  expect(moveKind(exam, 1, 1)).toBe('join');
  expect(moveKind(exam, 2, -1)).toBe('phase');

  const swap = moveStep(exam, 1, -1);
  expect(order(swap)).toBe('s2a s1a s3b s4c s5c');
  expect(swap.index).toBe(0);

  const join = moveStep(exam, 1, 1); // s2 가 묶음 a 의 끝 → b 로 들어감
  expect(order(join)).toBe('s1a s2b s3b s4c s5c');
  expectValid(join);

  const up = moveStep(exam, 2, -1); // s3 혼자인 b → a 앞으로
  expect(order(up)).toBe('s3b s1a s2a s4c s5c');
  expect(phaseOrder(up)).toBe('bac');
  expect(up.index).toBe(0);
  expectValid(up);

  const down = moveStep(exam, 2, 1); // b → c 뒤로
  expect(order(down)).toBe('s1a s2a s4c s5c s3b');
  expect(phaseOrder(down)).toBe('acb');
  expect(down.index).toBe(4);
  expectValid(down);

  expect(() => moveStep(exam, 4, 1)).toThrow(StructureError);
  expect(order(exam)).toBe('s1a s2a s3b s4c s5c'); // 원래 원고는 그대로
});

test('새 단계: 바로 뒤, 같은 묶음, 겹치지 않는 id, 사진 자리', () => {
  const exam = sample();
  expect(nextStepId(exam.steps)).toBe('s6');
  const r = insertStep(exam, 2);
  expect(order(r)).toBe('s1a s2a s3b s6b s4c s5c');
  expect(r.index).toBe(3);
  expect(r.steps[3]).toMatchObject({ id: 's6', phase: 'b', image: 'xray/s6.jpg' });
  expect(r.steps[3].text.length).toBeGreaterThan(0);
  expect(r.steps[3].imageAlt.length).toBeGreaterThan(0);
  expect(nextStepId([{ ...exam.steps[0], id: 'intro' }, { ...exam.steps[0], id: 's1' }])).toBe('s2');
});

test('단계 빼기: 혼자인 단계면 묶음도 같이, 마지막 하나는 못 뺌', () => {
  const exam = sample();
  const r = removeStep(exam, 0);
  expect(order(r)).toBe('s2a s3b s4c s5c');
  expect(r.removedPhase).toBeNull();

  const alone = removeStep(exam, 2);
  expect(order(alone)).toBe('s1a s2a s4c s5c');
  expect(alone.removedPhase?.id).toBe('b');
  expect(phaseOrder(alone)).toBe('ac');
  expectValid(alone);

  const one = { ...exam, steps: [exam.steps[0]], phases: [exam.phases[0]] };
  expect(() => removeStep(one, 0)).toThrow('하나뿐');
});

test('묶음 바꾸기: 가까운 끝에 붙음, 혼자인 단계는 못 옮김', () => {
  const exam = sample();
  const back = setStepPhase(exam, 4, 'a'); // s5 → a 의 끝
  expect(order(back)).toBe('s1a s2a s5a s3b s4c');
  expect(back.index).toBe(2);
  expectValid(back);

  const fwd = setStepPhase(exam, 0, 'c'); // s1 → c 의 처음
  expect(order(fwd)).toBe('s2a s3b s1c s4c s5c');
  expect(fwd.index).toBe(2);
  expectValid(fwd);

  expect(() => setStepPhase(exam, 2, 'a')).toThrow('이 단계뿐');
  expect(order(setStepPhase(exam, 0, 'a'))).toBe(order(exam));
});

test('검사 켜기·끄기·순서: 켜면 맨 뒤, 하나는 남아야 함', () => {
  expect(setExamOn(['xray', 'ecg'], 'blood', true)).toEqual(['xray', 'ecg', 'blood']);
  expect(setExamOn(['xray', 'ecg'], 'xray', false)).toEqual(['ecg']);
  expect(() => setExamOn(['xray'], 'xray', false)).toThrow(StructureError);
  expect(moveExam(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b']);
  expect(moveExam(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
});

test('문장 규칙: 거짓 약속·부정 명령·형광펜 짝 (원고 검사기와 같은 규칙)', () => {
  expect(textProblems('따끔할 수 있어요. 금방 끝나요.')).toEqual([]);
  expect(textProblems('하나도 안 아파요')).toHaveLength(1);
  expect(textProblems('움직이지 마세요')).toEqual([]); // "하지 마"만 잡음 (원래 규칙 그대로)
  expect(textProblems('절대 움직이면 안 돼요')).toHaveLength(1);
  expect(textProblems('**3초 동안 가만히')).toEqual(['형광펜 표시 ** 짝이 안 맞음']);
});

test('지금 병원 원고는 모두 구조 규칙을 지킴 (편집기가 고쳐도 깨지지 않는 출발점)', () => {
  const hospital = JSON.parse(readFileSync(join(HOSPITAL, 'hospital.json'), 'utf8')) as { exams: string[] };
  for (const id of hospital.exams) {
    const exam = JSON.parse(readFileSync(join(HOSPITAL, 'exams', `${id}.json`), 'utf8')) as ExamContent;
    expectValid(exam);
  }
});
