// 검사 하나의 페이지 흐름: 0 표지 → 1 순서 → 2.. 단계 → 마지막 칭찬 스티커판
import { useEffect, useRef } from 'react';
import type { ExamContent } from '../content/types';
import { hasMedia } from '../lib/asset';
import { keepImages } from '../lib/preload';
import { navigate } from '../lib/router';
import { stopExamSound } from '../lib/sound';
import { stopSpeaking } from '../lib/speech';
import { CHEER_IMAGE } from './common';
import { IntroPage } from './IntroPage';
import { OverviewPage } from './OverviewPage';
import { RewardPage } from './RewardPage';
import { StepPage } from './StepPage';

export function pageCount(exam: ExamContent): number {
  return exam.steps.length + 3;
}

/** 이 검사 화면들에 나오는 그림 (표지 → 순서 → 단계 → 스티커판 차례). 없는 파일은 요청하지 않음 */
export function examImages(exam: ExamContent): string[] {
  return [
    exam.cover.image,
    ...exam.phases.map((phase) => phase.illustration ?? phase.sticker),
    ...exam.steps.map((step) => step.image),
    // 연습에 나오는 그림도 (채혈 "볼 곳 고르기"의 풍선 등 — 그 검사 스티커가 아니라 따로 받아 둬야 함)
    ...exam.steps.flatMap((step) => (step.practice?.type === 'lookAway' ? step.practice.choices.map((c) => c.image) : [])),
    ...exam.phases.map((phase) => phase.sticker),
    CHEER_IMAGE,
  ].filter(hasMedia);
}

export function ExamFlow({ exam, page }: { exam: ExamContent; page: number }) {
  const last = pageCount(exam) - 1;
  const p = Math.min(Math.max(page, 0), last);
  const prev = useRef(p);
  const dir = p >= prev.current ? 'forward' : 'back';

  // 검사를 열면 그 검사 사진을 미리 다 받아 둠 (lib/preload.ts)
  useEffect(() => keepImages(examImages(exam)), [exam]);

  useEffect(() => {
    prev.current = p;
    window.scrollTo(0, 0);
    if (p !== page) navigate({ name: 'exam', examId: exam.id, page: p }, { replace: true });
  }, [p, page, exam.id]);

  // 페이지를 떠날 때 읽던 것과 검사 소리(기계음·안내 방송)를 멈춤. 정리(cleanup)에서 해야 새 페이지가 들어서며 시작한 자동 읽기를 끄지 않음
  // (React 는 앞 페이지 정리를 새 페이지 시작보다 먼저 함)
  useEffect(
    () => () => {
      stopSpeaking();
      stopExamSound();
    },
    [p, exam.id],
  );

  const goto = (delta: number) =>
    navigate({ name: 'exam', examId: exam.id, page: Math.min(Math.max(p + delta, 0), last) });

  let content;
  if (p === 0) content = <IntroPage exam={exam} goto={goto} />;
  else if (p === 1) content = <OverviewPage exam={exam} goto={goto} />;
  else if (p < last) content = <StepPage exam={exam} index={p - 2} goto={goto} />;
  else content = <RewardPage exam={exam} />;

  return (
    <div key={`${exam.id}-${p}`} className="screen-wrap page-enter" data-dir={dir}>
      {content}
    </div>
  );
}
