// 편집 동작: 파일을 다듬어 앱에 보냄 (editorState.applyEdit → 앱이 작업 폴더에 적용, 되돌리기 한 칸).
// 사진은 원고에 적힌 자리(파일 이름) 그대로 바꿔 넣음. 소리는 자리가 없으면 새 이름을 만들어 원고에 같이 적음.
import { PRACTICE_LIMITS } from '../content/rules';
import type { ExamContent, ImageView } from '../content/types';
import { isVideo } from '../lib/asset';
import type { MediaField } from '../lib/editHook';
import { navigate, type Route } from '../lib/router';
import { EFFECT_EXTS } from '../lib/sound';
import { applyEdit, showNotice } from './editorState';
import { isVideoFile, MediaError, prepareAudio, prepareImage, prepareVideo, withExt } from './media';
import type { EffectSlot, PhotoSlot, SenseSlot, VoiceSlot } from './slots';
import { insertStep, moveStep, removeStep, setStepPhase, type StepsAndPhases } from './structure';
import type { TextField } from './texts';
import type { EditOp } from './types';

const examFile = (examId: string) => `exams/${examId}.json`;

async function run(task: () => Promise<{ ops: EditOp[]; label: string }>): Promise<void> {
  try {
    const { ops, label } = await task();
    await applyEdit(ops, label);
  } catch (err) {
    showNotice(err instanceof MediaError ? err.message : `바꾸지 못했어요: ${err instanceof Error ? err.message : err}`);
  }
}

const where = (label: string) => label.replace(/ 사진$/, '');

/**
 * 사진·영상 넣기. 같은 종류면 그 자리(파일 이름) 그대로, 사진 ↔ 영상이 바뀌면 파일 이름의 확장자를 바꿔 원고에도 적음.
 * 새 사진이면 배치(imageView)는 처음으로. 원고에 칸이 없는 자리(첫 화면 카드)는 사진만
 */
export function replaceMedia(slot: Pick<PhotoSlot, 'path' | 'label' | 'field'>, file: File): Promise<void> {
  return run(async () => {
    const video = isVideoFile(file);
    if (video && !slot.field) throw new MediaError('이 자리에는 사진만 넣을 수 있어요');
    let path = slot.path;
    let bytes: Uint8Array;
    if (video) {
      const v = await prepareVideo(file);
      path = withExt(slot.path, v.ext);
      bytes = v.bytes;
    } else {
      if (isVideo(slot.path)) path = withExt(slot.path, 'jpg');
      bytes = await prepareImage(file, path);
    }
    const ops: EditOp[] = [{ kind: 'put', path, bytes }];
    if (slot.field) {
      if (path !== slot.path) {
        ops.push({ kind: 'remove', path: slot.path });
        ops.push({ kind: 'json', file: slot.field.file, pointer: slot.field.image, value: path });
      }
      ops.push({ kind: 'json', file: slot.field.file, pointer: slot.field.view });
    }
    return { ops, label: `${video ? '영상 넣기' : '사진 바꾸기'} · ${where(slot.label)}` };
  });
}

/** 기본 사진으로 (새 프로젝트의 기본 틀에 있던 사진·파일 이름, 배치도 처음으로. 기본 틀에 없던 자리는 빈 자리) — 본인 요청 2026-10-08 */
export function resetPhoto(slot: Pick<PhotoSlot, 'path' | 'label' | 'field'>): Promise<void> {
  return run(async () => ({ ops: [{ kind: 'reset', path: slot.path, field: slot.field }], label: `기본 사진으로 · ${where(slot.label)}` }));
}

/** 화면에서 조정한 배치 저장. 처음 모양(가운데·꽉 차게)이면 칸을 지움 */
export function saveView(field: MediaField, view: ImageView, label: string): Promise<void> {
  const plain = Math.abs(view.x) < 0.5 && Math.abs(view.y) < 0.5 && Math.abs(view.zoom - 1) < 0.01;
  const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
  return run(async () => ({
    ops: [
      {
        kind: 'json',
        file: field.file,
        pointer: field.view,
        value: plain ? undefined : { x: round(view.x), y: round(view.y), zoom: round(view.zoom, 2) },
      },
    ],
    label: `배치 조정 · ${where(label)}`,
  }));
}

/** 소리 자리 정하기: 있던 자리면 확장자만 맞추고, 없으면 새 이름. 확장자가 바뀌면 옛 파일은 지움 */
function soundOps(oldPath: string | undefined, fallback: string, ext: string, bytes: Uint8Array): { path: string; ops: EditOp[] } {
  const path = oldPath ? withExt(oldPath, ext) : `${fallback}.${ext}`;
  const ops: EditOp[] = [{ kind: 'put', path, bytes }];
  if (oldPath && oldPath !== path) ops.push({ kind: 'remove', path: oldPath });
  return { path, ops };
}

export function setVoice(slot: VoiceSlot, file: File): Promise<void> {
  return run(async () => {
    const { ext, bytes } = await prepareAudio(file);
    const step = slot.exam.steps[slot.stepIndex];
    const { path, ops } = soundOps(slot.path, `voice/${slot.exam.id}/${step.id}`, ext, bytes);
    if (path !== slot.path) ops.push({ kind: 'json', file: examFile(slot.exam.id), pointer: `/steps/${slot.stepIndex}/audio`, value: path });
    return { ops, label: `읽기 음성 넣기 · ${slot.label.replace(/ 읽기 음성$/, '')}` };
  });
}

export function removeVoice(slot: VoiceSlot): Promise<void> {
  if (!slot.path) return Promise.resolve();
  return run(async () => ({ ops: [{ kind: 'remove', path: slot.path! }], label: `읽기 음성 빼기 · ${slot.label.replace(/ 읽기 음성$/, '')}` }));
}

export function setSense(slot: SenseSlot, file: File): Promise<void> {
  return run(async () => {
    const { ext, bytes } = await prepareAudio(file);
    const step = slot.exam.steps[slot.stepIndex];
    const { path, ops } = soundOps(slot.path, `sense/${slot.exam.id}/${step.id}-${slot.cardIndex + 1}`, ext, bytes);
    if (path !== slot.path) {
      ops.push({ kind: 'json', file: examFile(slot.exam.id), pointer: `/steps/${slot.stepIndex}/sensory/${slot.cardIndex}/sound/file`, value: path });
    }
    return { ops, label: '미리 알아 두기 소리 넣기' };
  });
}

/** 넣은 소리 파일을 빼고 원고에서도 지움 → 효과음 이름(synth)이 있으면 그 효과음으로 돌아감 */
export function removeSense(slot: SenseSlot): Promise<void> {
  if (!slot.path) return Promise.resolve();
  return run(async () => ({
    ops: [
      { kind: 'remove', path: slot.path! },
      { kind: 'json', file: examFile(slot.exam.id), pointer: `/steps/${slot.stepIndex}/sensory/${slot.cardIndex}/sound/file` },
    ],
    label: '미리 알아 두기 소리 빼기',
  }));
}

// ───────── 글·구조·설정 (⑥단계) ─────────

/**
 * 글 칸 고치기. 비울 수 없는 칸을 비우면 안 바꾸고 false (칸이 원래 글로 돌아감).
 * 비워도 되는 칸을 비우면 원고에서 그 칸을 지움. 목록 칸은 한 줄에 하나씩
 */
export function setText(field: TextField, text: string, page: string, focusNext?: string): Promise<boolean> {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const value = Array.isArray(field.value) ? lines : text.trim() || undefined;
  if (field.required && (value === undefined || (Array.isArray(value) && value.length === 0))) {
    showNotice(`"${field.label}"은 비워 둘 수 없어요. 원래 글로 돌려 놓았어요`);
    return Promise.resolve(false);
  }
  // 첫 화면 카드 글(검사 이름·쉬운 말)은 시작할 때 만들어 두므로 화면을 다시 띄움 → 다음 칸 커서를 되살림
  return applyEdit([{ kind: 'json', file: field.file, pointer: field.pointer, value }], `글 고치기 · ${page} ${field.label}`, {
    live: !field.reload,
    after: { focus: focusNext },
  });
}

const examRoute = (examId: string, stepIndex: number): Route => ({ name: 'exam', examId, page: stepIndex + 2 });

/** 단계·묶음 목록을 통째로 바꿈 (되돌리기 한 칸) → 그 단계 페이지로 */
async function applyStructure(exam: ExamContent, change: () => StepsAndPhases, label: string, notice?: () => string): Promise<void> {
  let r: StepsAndPhases;
  try {
    r = change();
  } catch (err) {
    showNotice(err instanceof Error ? err.message : String(err));
    return;
  }
  const ok = await applyEdit(
    [
      { kind: 'json', file: examFile(exam.id), pointer: '/steps', value: r.steps },
      { kind: 'json', file: examFile(exam.id), pointer: '/phases', value: r.phases },
    ],
    label,
    { live: true },
  );
  if (!ok) return;
  navigate(examRoute(exam.id, r.index));
  if (notice) showNotice(notice());
}

export function moveStepAction(exam: ExamContent, index: number, dir: -1 | 1): void {
  void applyStructure(exam, () => moveStep(exam, index, dir), `단계 옮기기 · ${exam.title} ${index + 1}단계`);
}

export function insertStepAction(exam: ExamContent, index: number): void {
  void applyStructure(exam, () => insertStep(exam, index), `새 단계 · ${exam.title} ${index + 2}단계`, () => '새 단계를 넣었어요. 오른쪽에서 문장과 사진을 넣어 주세요');
}

export function removeStepAction(exam: ExamContent, index: number): void {
  let removedPhase: string | undefined;
  void applyStructure(
    exam,
    () => {
      const r = removeStep(exam, index);
      removedPhase = r.removedPhase?.title;
      return r;
    },
    `단계 빼기 · ${exam.title} ${index + 1}단계`,
    () => `${index + 1}단계를 뺐어요${removedPhase ? ` (묶음 "${removedPhase}"도 같이)` : ''}. 되돌리기(Ctrl+Z)로 되살릴 수 있어요`,
  );
}

export function setStepPhaseAction(exam: ExamContent, index: number, phaseId: string): void {
  const title = exam.phases.find((p) => p.id === phaseId)?.title ?? phaseId;
  void applyStructure(exam, () => setStepPhase(exam, index, phaseId), `묶음 바꾸기 · ${exam.title} ${index + 1}단계 → ${title}`);
}

/** 원고 한 칸 바꾸기 (켜기·끄기, 숫자). live = 화면을 다시 띄우지 않음 */
function setValue(file: string, pointer: string, value: unknown, label: string, live = true): void {
  void applyEdit([{ kind: 'json', file, pointer, value }], label, { live });
}

export function setSensitive(exam: ExamContent, index: number, on: boolean): void {
  setValue(examFile(exam.id), `/steps/${index}/sensitive`, on ? true : undefined, `바늘·피 사진 ${on ? '표시' : '표시 빼기'} · ${exam.title} ${index + 1}단계`);
}

/** 연습 숫자 (초·횟수). 범위 밖이면 범위 안으로 */
export function setPracticeNumber(exam: ExamContent, index: number, key: 'seconds' | 'count', n: number): void {
  const lim = PRACTICE_LIMITS[key];
  const value = Math.min(lim.max, Math.max(lim.min, Math.round(n)));
  setValue(examFile(exam.id), `/steps/${index}/practice/${key}`, value, `연습 ${key === 'count' ? '횟수' : '시간'} ${value}${key === 'count' ? '번' : '초'} · ${exam.title} ${index + 1}단계`);
}

/** 첫 화면 검사 목록 (hospital.json exams). 검사 목록은 시작할 때 만들어 두므로 화면을 다시 띄움 */
export function setExamList(list: string[], label: string): void {
  setValue('hospital.json', '/exams', list, label, false);
}

/** 효과음: sounds/<이름>.<확장자>. 다른 확장자로 넣어 둔 것은 지움 (mp3 가 먼저 쓰이므로 — lib/sound.ts effectFile) */
export function setEffect(slot: EffectSlot, file: File): Promise<void> {
  return run(async () => {
    const { ext, bytes } = await prepareAudio(file);
    const ops: EditOp[] = [{ kind: 'put', path: `sounds/${slot.id}.${ext}`, bytes }];
    for (const other of EFFECT_EXTS) if (other !== ext) ops.push({ kind: 'remove', path: `sounds/${slot.id}.${other}` });
    return { ops, label: `효과음 넣기 · ${slot.label}` };
  });
}

/** 프로젝트에 넣은 효과음만 지움 (앱에 들어 있는 기본 소리 — 패드 "톡" — 는 남음) */
export function removeEffect(slot: EffectSlot): Promise<void> {
  return run(async () => ({
    ops: EFFECT_EXTS.map((ext) => ({ kind: 'remove' as const, path: `sounds/${slot.id}.${ext}` })),
    label: `효과음 빼기 · ${slot.label}`,
  }));
}
