// 페이지마다 바꿀 수 있는 사진·소리 자리 (편집 모드의 오른쪽 칸·빠진 것 목록이 같이 씀)
// 자리 = 원고에 적힌 파일 이름. 사진은 그 이름 그대로 바꿔 넣고, 소리는 자리가 없으면 새로 만들어 원고에 적음 (actions.ts)
import { catalog, exams, getExam } from '../content';
import type { ExamContent, SynthId } from '../content/types';
import { hasMedia, mediaStatus, type MediaStatus } from '../lib/asset';
import type { MediaField } from '../lib/editHook';
import type { Route } from '../lib/router';
import { effectFile } from '../lib/sound';

export interface PhotoSlot {
  kind: 'photo';
  /** content/ 아래 경로 = 바꿔 넣을 자리 */
  path: string;
  label: string;
  status: MediaStatus;
  route: Route;
  /** 원고의 칸 (있으면 영상으로 바꾸기·배치 저장·기본 사진으로 파일 이름 되돌리기가 됨). 첫 화면 카드는 없음 */
  field?: MediaField;
}

export interface VoiceSlot {
  kind: 'voice';
  exam: ExamContent;
  stepIndex: number;
  /** 원고의 step.audio (없으면 아직 자리 없음) */
  path?: string;
  label: string;
  ready: boolean;
  route: Route;
}

export interface SenseSlot {
  kind: 'sense';
  exam: ExamContent;
  stepIndex: number;
  cardIndex: number;
  /** 원고의 sensory[i].sound.file */
  path?: string;
  /** 파일이 없을 때 쓰는 효과음 이름 */
  synth?: SynthId;
  /** 카드 문장 */
  text: string;
  label: string;
  ready: boolean;
  route: Route;
}

export interface EffectSlot {
  kind: 'effect';
  id: SynthId;
  label: string;
  ready: boolean;
}

export type Slot = PhotoSlot | VoiceSlot | SenseSlot | EffectSlot;

/** 효과음 7가지 (lib/sound.ts). 이름은 편집기에 보이는 말 */
export const EFFECTS: { id: SynthId; label: string }[] = [
  { id: 'chime', label: '칭찬 "딩동" (연습 성공·스티커)' },
  { id: 'announce', label: '안내 방송 "딩동" (이름 부르기)' },
  { id: 'tick', label: '순서 고르기 "톡"' },
  { id: 'pad', label: '패드 붙이기 "톡"' },
  { id: 'xray-beep', label: '엑스레이 기계 "삐-"' },
  { id: 'ecg-beep', label: '심전도 기계 "삐, 삐"' },
  { id: 'gel', label: '초음파 젤 소리' },
];

/** 페이지 이름: "흉부 엑스레이 3단계" */
export function pageLabel(route: Route): string {
  if (route.name === 'home') return '첫 화면';
  if (route.name === 'complete') return '다 모은 축하';
  const exam = getExam(route.examId);
  if (!exam) return route.examId;
  const last = exam.steps.length + 2;
  if (route.page === 0) return `${exam.title} 표지`;
  if (route.page === 1) return `${exam.title} 순서 알아보기`;
  if (route.page >= last) return `${exam.title} 스티커판`;
  return `${exam.title} ${route.page - 1}단계`;
}

const examRoute = (exam: ExamContent, page: number): Route => ({ name: 'exam', examId: exam.id, page });

function stepSlots(exam: ExamContent, stepIndex: number): Slot[] {
  const step = exam.steps[stepIndex];
  const route = examRoute(exam, stepIndex + 2);
  const name = `${exam.title} ${stepIndex + 1}단계`;
  const out: Slot[] = [];
  const file = `exams/${exam.id}.json`;
  if (step.image) {
    const field = { file, image: `/steps/${stepIndex}/image`, view: `/steps/${stepIndex}/imageView` };
    out.push({ kind: 'photo', path: step.image, label: `${name} 사진`, status: mediaStatus(step.image), route, field });
  }
  out.push({ kind: 'voice', exam, stepIndex, path: step.audio, label: `${name} 읽기 음성`, ready: hasMedia(step.audio), route });
  (step.sensory ?? []).forEach((card, cardIndex) => {
    if (!card.sound) return;
    const ready = hasMedia(card.sound.file) || (!!card.sound.synth && hasMedia(effectFile(card.sound.synth)));
    out.push({
      kind: 'sense',
      exam,
      stepIndex,
      cardIndex,
      path: card.sound.file,
      synth: card.sound.synth,
      text: card.text,
      label: `${name} 미리 알아 두기 · ${card.text}`,
      ready,
      route,
    });
  });
  return out;
}

/** 이 페이지의 사진·소리 자리 */
export function pageSlots(route: Route): Slot[] {
  if (route.name === 'home') {
    return catalog.map((item) => ({
      kind: 'photo' as const,
      path: item.cover,
      label: `첫 화면 "${item.title}" 카드 사진`,
      status: mediaStatus(item.cover),
      route,
    }));
  }
  if (route.name !== 'exam') return [];
  const exam = getExam(route.examId);
  if (!exam) return [];
  if (route.page === 0) {
    const field = { file: `exams/${exam.id}.json`, image: '/cover/image', view: '/cover/imageView' };
    return [{ kind: 'photo', path: exam.cover.image, label: `${exam.title} 표지 사진`, status: mediaStatus(exam.cover.image), route, field }];
  }
  const stepIndex = route.page - 2;
  if (stepIndex >= 0 && stepIndex < exam.steps.length) return stepSlots(exam, stepIndex);
  return [];
}

export function effectSlots(): EffectSlot[] {
  return EFFECTS.map((e) => ({ kind: 'effect', id: e.id, label: e.label, ready: hasMedia(effectFile(e.id)) }));
}

/** 프로젝트 전체에서 아직 없는 것·임시인 것 (빠진 것 목록) */
export function missingSlots(): { photos: PhotoSlot[]; temps: PhotoSlot[]; voices: VoiceSlot[]; senses: SenseSlot[]; effects: EffectSlot[] } {
  const all: Slot[] = [...pageSlots({ name: 'home' })];
  for (const exam of exams) {
    all.push(...pageSlots(examRoute(exam, 0)));
    exam.steps.forEach((_, i) => all.push(...stepSlots(exam, i)));
  }
  const photos = all.filter((s): s is PhotoSlot => s.kind === 'photo');
  return {
    photos: photos.filter((s) => s.status === 'missing'),
    temps: photos.filter((s) => s.status === 'temp'),
    voices: all.filter((s): s is VoiceSlot => s.kind === 'voice' && !s.ready),
    senses: all.filter((s): s is SenseSlot => s.kind === 'sense' && !s.ready),
    effects: effectSlots().filter((s) => !s.ready),
  };
}
