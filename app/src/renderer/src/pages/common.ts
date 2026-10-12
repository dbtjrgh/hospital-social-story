import type { CSSProperties } from 'react';
import { catalog, getExam } from '../content';
import type { ExamProgress } from '../lib/store';

/** 차례로 등장 순서 (CSS 변수 --i). 0 = 맨 먼저 */
export function order(i: number): CSSProperties {
  return { '--i': i } as CSSProperties;
}

/** 검사 안에서 페이지 이동 (+1 다음, -1 이전, 또는 절대 페이지) */
export type Goto = (delta: number) => void;

/** 스티커판의 응원 그림 (공통 그림) */
export const CHEER_IMAGE = 'common/cheer.png';

/** 원고가 있는 검사 (검사 선택 화면 순서) */
export function readyExams() {
  return catalog.flatMap((item) => {
    const exam = getExam(item.id);
    return exam ? [{ item, exam }] : [];
  });
}

/** 원고가 있는 검사를 모두 끝까지 해 봤는지 → 첫 화면 "다 모았어요" + 축하 화면 (#/complete) */
export function allExamsDone(progress: Record<string, ExamProgress>): boolean {
  const ready = readyExams();
  return ready.length > 0 && ready.every(({ item }) => (progress[item.id]?.completedCount ?? 0) > 0);
}
