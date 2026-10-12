// 효과음·검사 소리. 파일이 있으면 그 파일을 틉니다.
// 지금은 소리 파일이 없어서 소리를 내지 않고, 없는 파일을 로그로 남긴 뒤 소리 길이만큼 "재생하는 척" 합니다 (2026-10-06)
// → onEnd 를 그 시간 뒤에 불러서 버튼 애니메이션이 실제 파일과 같게 돎. (Web Audio 합성음은 쓰지 않음)
// 원칙: 누를 때만 소리 남(자동재생 없음), 실패·오답 소리 없음, 작게 → 보통 → 크게 단계로 들어 볼 수 있음.
import type { SoundRef, SynthId } from '../content/types';
import { asset, hasMedia } from './asset';
import { getState } from './store';

/** 점진적 노출 단계 */
export const SOUND_LEVELS = [
  { id: 'soft', label: '작게', level: 0.35 },
  { id: 'normal', label: '보통', level: 0.65 },
  { id: 'real', label: '크게', level: 1 },
] as const;

/**
 * 효과음 파일 자리: content/sounds/<이름>.mp3 (예: sounds/chime.mp3). 병원 media/ 나 public/content/ 에 넣으면 틂.
 * mp3가 없고 .wav가 있으면 그것 — 임시로 직접 만든 소리 (public/content/sounds/pad.wav "톡", 2026-10-07 본인 요청).
 * 진짜 파일을 sounds/<이름>.mp3로 넣으면 그쪽이 먼저
 */
export function effectFile(id: SynthId): string {
  // 편집기에서 넣은 소리는 m4a·ogg 일 수도 있음 (editor/actions.ts). mp3 가 먼저
  for (const ext of EFFECT_EXTS) {
    const path = `sounds/${id}.${ext}`;
    if (hasMedia(path)) return path;
  }
  return `sounds/${id}.mp3`;
}

/** 효과음 파일 확장자 (앞이 먼저) */
export const EFFECT_EXTS = ['mp3', 'wav', 'm4a', 'ogg'] as const;

/** 파일이 없을 때 재생하는 척하는 길이 (실제 소리가 오면 그 파일 길이를 따름) */
const FAKE_MS: Record<SynthId, number> = {
  chime: 1200,
  announce: 2500,
  tick: 300,
  'xray-beep': 1500,
  'ecg-beep': 2000,
  gel: 1500,
  pad: 400, // 심전도 패드를 "톡" 붙이는 소리
};
const FAKE_FILE_MS = 2000;

let current: HTMLAudioElement | null = null;
/** 지금 소리가 검사 소리(기계음·안내 방송)인지 짧은 효과음인지 → 페이지를 떠날 때 검사 소리만 멈춤 */
let currentKind: 'effect' | 'exam' = 'effect';

function playFile(path: string, level: number, onEnd?: () => void, kind: 'effect' | 'exam' = 'effect') {
  const { volume } = getState().settings;
  current?.pause();
  const a = new Audio(asset(path));
  a.volume = Math.min(1, volume * level);
  a.onended = () => onEnd?.();
  current = a;
  currentKind = kind;
  a.play().catch(() => {
    console.warn(`[사운드] 재생 실패: ${path}`);
    onEnd?.();
  });
}

/** 지금 나는 효과음·병원 소리 파일을 멈춤 (보호자 메뉴에서 소리를 끌 때) */
export function stopSound(): void {
  current?.pause();
  current = null;
}

/** 페이지를 떠날 때: 검사 소리(긴 기계음·안내 방송)만 멈춤. 칭찬 효과음은 짧아서 다음 페이지까지 그대로 (10-07 검수) */
export function stopExamSound(): void {
  if (currentKind === 'exam') stopSound();
}

function fakePlay(ms: number, onEnd?: () => void) {
  if (onEnd) window.setTimeout(onEnd, ms);
}

/** 칭찬 "딩동" 같은 짧은 효과음. onEnd = 소리가 끝났을 때 (파일이 없으면 그 길이만큼 지난 뒤) */
export function playSynth(id: SynthId, level = 1, onEnd?: () => void, kind: 'effect' | 'exam' = 'effect'): void {
  if (!getState().settings.sound) return void onEnd?.();
  const file = effectFile(id);
  if (hasMedia(file)) return playFile(file, level, onEnd, kind);
  console.warn(`[사운드 없음] 효과음 파일 없음: ${file} (소리 없이 ${FAKE_MS[id] / 1000}초 동안 재생 표시만)`);
  fakePlay(FAKE_MS[id], onEnd);
}

/** 원고의 검사 소리 (기계음·안내 방송 등) */
export function playSound(ref: SoundRef, level = 1, onEnd?: () => void): void {
  if (!getState().settings.sound) return void onEnd?.();
  if (hasMedia(ref.file)) return playFile(ref.file, level, onEnd, 'exam');
  if (ref.synth) return playSynth(ref.synth, level, onEnd, 'exam');
  console.warn(`[사운드 없음] 사운드 파일 없음: ${ref.file ?? '(원고에 파일 자리 없음)'} — ${ref.label} (소리 없이 ${FAKE_FILE_MS / 1000}초 동안 재생 표시만)`);
  fakePlay(FAKE_FILE_MS, onEnd);
}
