// 진행 상황과 설정. 기기 안(localStorage)에만 저장합니다. 서버로 보내지 않습니다.
import { useSyncExternalStore } from 'react';
import { project } from '../content/project';

export interface ExamProgress {
  /** "했어요"를 누른 단계 id */
  checked: string[];
  /** 받은 스티커(묶음 id) */
  stickers: string[];
  /** 연습에 성공한 단계 id */
  practiced: string[];
  /** 끝까지 마친 횟수 */
  completedCount: number;
}

export interface Settings {
  /** 함께 가는 사람 호칭 */
  companion: string;
  /** 이름 부르기 연습에 쓰는 이름 (선택) */
  name: string;
  sound: boolean;
  /** 0~1 */
  volume: number;
  /** 말 빠르기 0.6~1.2 */
  rate: number;
  reduceMotion: 'system' | 'on' | 'off';
  /** 글자 크기 배율 1 / 1.15 / 1.3 */
  textScale: number;
  /** 페이지에 들어설 때 문장을 한 번 읽어 줌 (기본 켬, 2026-10-06. 예전 이름 autoRead 는 기본 꺼짐이었음 → 이름을 바꿔 예전 저장값이 안 남게) */
  readAloud: boolean;
  /** 바늘·피가 보일 수 있는 사진 가리기 (원고의 sensitive 단계) */
  hideNeedle: boolean;
  /** 오래 멈추면 손가락이 누를 곳을 가리킴. 끄면 빛 고리까지만 */
  guideHand: boolean;
  /** 연습이 있는 단계는 연습을 해내야 "했어요"가 켜짐 (기본 켬, 2026-10-07). 끄면 늘 누를 수 있음 (손 쓰기가 어려운 아이) */
  practiceGate: boolean;
  /** 초기 설정 화면(보호자 초기 설정 창, components/SetupDialog). 현장에 따라 끔 → 처음 열 때·다음 사람 지우기 뒤에도 바로 첫 화면 (2026-10-07 본인 요청) */
  showSetup: boolean;
}

export interface AppState {
  progress: Record<string, ExamProgress>;
  settings: Settings;
  /** 5종을 다 모은 축하 화면을 한 번 봤는지 → 첫 화면 빛 고리를 그 화면으로 보낼지 (2026-10-06) */
  allDoneSeen: boolean;
  /** 처음 화면 셋업(보호자가 호칭·이름·바늘 사진을 정함)을 마쳤거나 건너뛰었는지 (2026-10-07) */
  setupSeen: boolean;
}

/** 함께 가는 사람 (셋업·보호자 메뉴에서 고름) */
export const COMPANIONS = ['엄마/아빠', '엄마', '아빠', '보호자', '학교 선생님', '할머니', '할아버지'];

export const defaultSettings: Settings = {
  companion: '엄마/아빠',
  name: '',
  sound: true,
  volume: 0.7,
  rate: 0.9,
  reduceMotion: 'system',
  textScale: 1,
  readAloud: true,
  hideNeedle: false,
  guideHand: true,
  practiceGate: true,
  showSetup: true,
};

const emptyProgress: ExamProgress = { checked: [], stickers: [], practiced: [], completedCount: 0 };
// 병원마다 따로 저장 (같은 주소 아래 여러 병원 빌드를 올려도 스티커·설정이 섞이지 않게)
const STORAGE_KEY = `social-story:${project().hospital.id}:v1`;
/** 병원 팩 이전에 쓰던 키 → 한 번 옮겨 옴 */
const OLD_STORAGE_KEY = 'social-story:v1';

// 저장값이 깨졌거나 예전 모양이어도 화면이 하얗게 멈추지 않게, 모양이 맞는 값만 씀
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function cleanProgress(raw: unknown): Record<string, ExamProgress> {
  if (!raw || typeof raw !== 'object') return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, Partial<ExamProgress> | null>).map(([id, p]) => [
      id,
      {
        checked: strings(p?.checked),
        stickers: strings(p?.stickers),
        practiced: strings(p?.practiced),
        completedCount: Number.isFinite(p?.completedCount) ? Number(p?.completedCount) : 0,
      },
    ]),
  );
}

/** 형이 맞아도 화면이 깨지는 값은 버림 (글자 크기 0, 호칭 빈칸 등 — 저장소를 손으로 고치거나 동기화로만 생김, 2026-10-07 다듬기) */
const settingOk: { [K in keyof Settings]?: (v: Settings[K]) => boolean } = {
  // 메뉴에 있는 호칭만 (없는 값이면 메뉴에 눌린 칩이 없음, 10-07 검수)
  companion: (v) => COMPANIONS.includes(v),
  volume: (v) => v >= 0.1 && v <= 1,
  rate: (v) => v >= 0.6 && v <= 1.2,
  reduceMotion: (v) => ['system', 'on', 'off'].includes(v),
  textScale: (v) => [1, 1.15, 1.3].includes(v),
};

function cleanSettings(raw: unknown): Settings {
  const out: Record<string, unknown> = { ...defaultSettings };
  if (raw && typeof raw === 'object')
    for (const [k, saved] of Object.entries(raw)) {
      // 예전 호칭 "선생님"은 지금 "학교 선생님" (의료진도 "선생님"이라 2026-10-06에 바꿈 — 그 전에 고른 기기)
      const v = k === 'companion' && saved === '선생님' ? '학교 선생님' : saved;
      if (!(k in out) || typeof v !== typeof out[k]) continue;
      const ok = settingOk[k as keyof Settings] as ((v: unknown) => boolean) | undefined;
      if (!ok || ok(v)) out[k] = v;
    }
  return out as unknown as Settings;
}

function load(): AppState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(OLD_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppState> | null;
      return {
        progress: cleanProgress(parsed?.progress),
        settings: cleanSettings(parsed?.settings),
        allDoneSeen: parsed?.allDoneSeen === true,
        // 셋업이 생기기 전부터 쓰던 기기(저장값에 칸이 없음)는 이미 쓰던 것으로 봄 → 셋업 없이 그대로
        setupSeen: parsed?.setupSeen !== false,
      };
    }
  } catch {
    // 개인 정보 보호 모드 등에서는 저장이 막힐 수 있음 → 기본값으로 시작
  }
  return freshState();
}

/** 처음 쓰는 기기의 상태 */
function freshState(): AppState {
  return { progress: {}, settings: { ...defaultSettings }, allDoneSeen: false, setupSeen: false };
}

/**
 * 미리보기용 빈 기록 (편집기 미리보기, CLAUDE.md 1-c ④단계): 켜면 처음 쓰는 사람처럼 빈 상태로 시작하고 저장하지 않음,
 * 끄면 저장된 원래 기록으로 돌아감 → 미리보기에서 받은 스티커·바꾼 설정이 편집 화면이나 다음 미리보기에 남지 않음
 */
let sandbox = false;

function save(state: AppState) {
  if (sandbox) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 저장 실패해도 화면은 계속 동작
  }
}

export type StoreListener = (state: AppState, meta: { remote: boolean }) => void;

let state: AppState = load();
const listeners = new Set<StoreListener>();

/**
 * 잠시 덮어쓰는 설정 (편집기 편집 모드: 자동 읽기·연습 먼저 하기·손가락 안내·처음 셋업을 끔 — editor/editorState.ts).
 * 저장되는 설정(state)은 그대로 두고, 화면이 읽는 값(view)만 바꿈
 */
let overrides: Partial<Settings> = {};
let view: AppState = state;

function refreshView() {
  view = Object.keys(overrides).length === 0 ? state : { ...state, settings: { ...state.settings, ...overrides } };
}

function setState(next: AppState, remote = false) {
  state = next;
  save(state);
  refreshView();
  listeners.forEach((l) => l(view, { remote }));
}

/** 미리보기용 빈 기록 켜기·끄기 (켤 때마다 새로 빈 상태) */
export function setSandbox(on: boolean): void {
  sandbox = on;
  state = on ? freshState() : load();
  refreshView();
  listeners.forEach((l) => l(view, { remote: true }));
}

/** 설정을 잠시 덮어씀 (빈 값이면 원래대로). 저장하지 않음 */
export function setSettingOverrides(next: Partial<Settings>): void {
  overrides = next;
  refreshView();
  listeners.forEach((l) => l(view, { remote: true }));
}

/** 화면이 읽는 상태 (덮어쓴 설정 포함) */
export function getState(): AppState {
  return view;
}

export function subscribeStore(listener: StoreListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 다른 기기에서 받은 상태로 바꿈 (개발용 동기화). 받은 쪽은 다시 보내지 않도록 remote=true */
export function setStateFromRemote(next: AppState): void {
  setState(
    {
      progress: cleanProgress(next.progress),
      settings: cleanSettings(next.settings),
      allDoneSeen: next.allDoneSeen === true,
      setupSeen: next.setupSeen !== false,
    },
    true,
  );
}

export function useAppState<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    (cb) => subscribeStore(() => cb()),
    () => selector(view),
  );
}

export function getProgress(examId: string): ExamProgress {
  return view.progress[examId] ?? emptyProgress;
}

export function useProgress(examId: string): ExamProgress {
  return useAppState((s) => s.progress[examId] ?? emptyProgress);
}

export function useSettings(): Settings {
  return useAppState((s) => s.settings);
}

function updateProgress(examId: string, fn: (p: ExamProgress) => ExamProgress) {
  const current = state.progress[examId] ?? emptyProgress;
  setState({ ...state, progress: { ...state.progress, [examId]: fn(current) } });
}

const addUnique = (list: string[], id: string) => (list.includes(id) ? list : [...list, id]);

export function checkStep(examId: string, stepId: string): void {
  updateProgress(examId, (p) => ({ ...p, checked: addUnique(p.checked, stepId) }));
}

export function earnSticker(examId: string, phaseId: string): void {
  updateProgress(examId, (p) => ({ ...p, stickers: addUnique(p.stickers, phaseId) }));
}

export function markPracticed(examId: string, stepId: string): void {
  updateProgress(examId, (p) => ({ ...p, practiced: addUnique(p.practiced, stepId) }));
}

export function completeExam(examId: string): void {
  updateProgress(examId, (p) => ({ ...p, completedCount: p.completedCount + 1 }));
}

/** 다시 연습하기: 체크·스티커만 비우고, 마친 횟수는 남김 */
export function restartExam(examId: string): void {
  updateProgress(examId, (p) => ({ ...emptyProgress, completedCount: p.completedCount }));
}

/**
 * 다 마친 검사를 처음부터 다시 시작하면 새 회차로 ("다시 연습하기"와 같음). 하다 만 검사는 그대로 이어서.
 * 예전에는 첫 화면 카드로 다시 열면 지난 체크·연습이 남아, 마친 횟수가 안 오르고 빛 고리가 연습을 건너뛰었음 (2026-10-07 본인 지적)
 */
export function startRound(exam: { id: string; steps: { id: string }[] }): void {
  const { checked } = getProgress(exam.id);
  if (exam.steps.length > 0 && exam.steps.every((s) => checked.includes(s.id))) restartExam(exam.id);
}

/** 진행 기록만 비움 (설정은 남김) */
export function resetAll(): void {
  setState({ ...state, progress: {}, allDoneSeen: false });
}

/**
 * 다음 사람을 위해 지우기 (병원 공용 태블릿, 2026-10-07): 진행 기록·이름·설정을 모두 처음 상태로.
 * 다음 사람도 셋업부터. 단 "초기 설정 화면"은 그 현장의 설정이라 남김
 */
export function resetForNextPerson(): void {
  setState({ progress: {}, settings: { ...defaultSettings, showSetup: state.settings.showSetup }, allDoneSeen: false, setupSeen: false });
}

/** 처음 화면 셋업 끝: 시작하기 = 고른 설정을 저장 / 건너뛰기 = 기본값 그대로 */
export function finishSetup(changes?: Partial<Settings>): void {
  setState({ ...state, settings: changes ? cleanSettings({ ...state.settings, ...changes }) : state.settings, setupSeen: true });
}

/** 보호자 메뉴 "초기 설정 화면". 켜도 메뉴를 보던 화면이 셋업으로 바뀌지 않게, 다음 사람(지우기 뒤)부터 셋업 */
export function setShowSetup(on: boolean): void {
  setState({ ...state, settings: { ...state.settings, showSetup: on }, setupSeen: on || state.setupSeen });
}

/** 다 모은 축하 화면을 봄 */
export function markAllDoneSeen(): void {
  if (!state.allDoneSeen) setState({ ...state, allDoneSeen: true });
}

export function updateSettings(patch: Partial<Settings>): void {
  setState({ ...state, settings: { ...state.settings, ...patch } });
}
