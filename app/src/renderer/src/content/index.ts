// 검사 원고 모음. 시작할 때 읽어 둔 프로젝트(content/project.json — ./project.ts)의 병원 설정과 검사 원고.
// 병원 이름으로 나누는 코드는 쓰지 않음 — 차이는 전부 데이터로 (CLAUDE.md 5-2).
import { project } from './project';
import type { ExamContent, HospitalConfig, ThemeName } from './types';

export const hospital: HospitalConfig = project().hospital;

/** 이 병원이 쓰는 검사만 (hospital.json 의 exams 순서) */
export const exams: ExamContent[] = project()
  .exams.filter((e) => hospital.exams.includes(e.id))
  .sort((a, b) => hospital.exams.indexOf(a.id) - hospital.exams.indexOf(b.id));

export function getExam(id: string): ExamContent | undefined {
  return exams.find((e) => e.id === id);
}

/** 검사 선택 화면의 카드. 원고 JSON이 아직 없는 검사는 "준비 중"으로 보임 */
export interface CatalogItem {
  id: string;
  title: string;
  easyTitle: string;
  theme: ThemeName;
  /** 카드 사진: 병원 media/covers/<id>.jpg */
  cover: string;
  coverAlt: string;
}

/** 엔진이 아는 기본 검사 5종의 카드 정보. 원고가 있으면 원고의 제목·색이 우선 */
const KNOWN: Record<string, Omit<CatalogItem, 'id' | 'cover'>> = {
  xray: { title: '흉부 엑스레이 촬영', easyTitle: '가슴 사진 찍기', theme: 'blue', coverAlt: '엑스레이 기계와 가슴 사진' },
  ultrasound: { title: '복부 초음파', easyTitle: '배 속 사진 보기', theme: 'green', coverAlt: '초음파 기계' },
  ecg: { title: '심전도', easyTitle: '심장 소리 그림 그리기', theme: 'yellow', coverAlt: '심전도 기계와 동그란 패드' },
  blood: { title: '채혈', easyTitle: '팔에서 피를 조금 뽑아요', theme: 'pink', coverAlt: '쟁반 위에 놓인 하얀 솜' },
  iv: { title: '정맥주사', easyTitle: '가는 관으로 약을 넣어요', theme: 'purple', coverAlt: '수액 걸이' },
};

export const catalog: CatalogItem[] = hospital.exams.map((id) => {
  const exam = getExam(id);
  const known = KNOWN[id];
  return {
    id,
    title: exam?.title ?? known?.title ?? id,
    easyTitle: exam?.easyTitle ?? known?.easyTitle ?? '',
    theme: exam?.theme ?? known?.theme ?? 'blue',
    cover: `covers/${id}.jpg`,
    coverAlt: known?.coverAlt ?? exam?.title ?? id,
  };
});

/** 개발 중 원고 점검 (자세한 점검은 yarn check:content) */
if (import.meta.env.DEV) {
  for (const exam of exams) {
    const phaseIds = new Set(exam.phases.map((p) => p.id));
    for (const step of exam.steps) {
      if (!phaseIds.has(step.phase)) console.warn(`[원고] ${exam.id}/${step.id}: 없는 묶음 '${step.phase}'`);
    }
    for (const phase of exam.phases) {
      if (!exam.steps.some((s) => s.phase === phase.id)) console.warn(`[원고] ${exam.id}: 단계가 없는 묶음 '${phase.id}'`);
    }
  }
}
