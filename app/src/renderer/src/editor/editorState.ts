// 편집기 상태 (Electron 앱 안에서만 — window.ssApp 이 있을 때). CLAUDE.md 1-c ③단계
//   mode: 편집(edit) = 페이지 목록·소리 칸·사진 바꾸기, 미리보기(preview) = 플레이어 그대로 (④단계)
//   미리보기: 기기 크기를 골라 그 크기의 .stage 로 (화면 모양 기준이 .stage 라 실제 기기와 같은 모양 — base.css), 화면보다 크면 줄여 보여 줌.
//            들어갈 때마다 빈 기록(처음 쓰는 사람)으로 시작, 저장하지 않음 (store.setSandbox). 보던 페이지(주소) 그대로
//   편집을 적용하면 앱이 화면을 다시 띄우므로, 모드는 이 창의 sessionStorage 에 남겨 새로고침 뒤에도 그대로
import { useSyncExternalStore } from 'react';
import { project } from '../content/project';
import { fx } from '../fx/fx';
import { bumpContentVersion } from '../lib/editHook';
import { navigate, type Route } from '../lib/router';
import { setSandbox, setSettingOverrides } from '../lib/store';
import type { EditOp, EditState, WebCheckResult } from './types';

export type EditorMode = 'edit' | 'preview';

/** 편집기(Electron 앱) 안인지. 웹 납품에서는 false → 편집 기능이 전혀 안 보임 */
export const isEditor = typeof window !== 'undefined' && !!window.ssApp;

const MODE_KEY = 'editor:mode';
const DEVICE_KEY = 'editor:device';

export type DeviceId = 'phone' | 'tablet' | 'tablet-lg' | 'landscape' | 'fit';
/** 미리보기 기기 크기 (자동 점검의 화면 크기와 같은 무리). fit = 가운데 영역 전체 */
export const DEVICES: { id: DeviceId; label: string; w?: number; h?: number }[] = [
  { id: 'phone', label: '폰', w: 375, h: 812 },
  { id: 'tablet', label: '태블릿', w: 768, h: 1024 },
  { id: 'tablet-lg', label: '큰 태블릿', w: 820, h: 1180 },
  { id: 'landscape', label: '가로 태블릿', w: 1280, h: 800 },
  { id: 'fit', label: '창에 맞춤' },
];

function readDevice(): DeviceId {
  try {
    const saved = window.localStorage.getItem(DEVICE_KEY);
    if (DEVICES.some((d) => d.id === saved)) return saved as DeviceId;
  } catch {
    // 저장소가 막히면 기본
  }
  return 'tablet';
}

function readMode(): EditorMode {
  try {
    return window.sessionStorage.getItem(MODE_KEY) === 'preview' ? 'preview' : 'edit';
  } catch {
    return 'edit';
  }
}

interface Snapshot {
  mode: EditorMode;
  device: DeviceId;
  /** 미리보기 기기가 화면보다 커서 줄여 보여 주는 비율 (1 = 실제 크기) */
  scale: number;
  edit: EditState | null;
  /** 잠깐 보여 줄 안내 (넣을 수 없는 파일 등) */
  notice: string | null;
  /** 편집을 적용하는 중 (앱이 화면을 다시 띄우기 전까지) */
  busy: boolean;
  /** 웹으로 내보내기 창 (⑤단계, ExportDialog) */
  exportOpen: boolean;
  /** 화면을 다시 띄우지 않고 원고를 바로 고친 횟수 (글 고치기). 바뀌면 편집기 칸을 새로 그림 (플레이어는 lib/editHook.ts) */
  contentVersion: number;
  /** 내보낸 zip 확인 (CheckDialog): null = 안 함, working = 읽는 중, done = 결과(서버가 켜져 있으면 url) */
  check: null | { kind: 'working' } | { kind: 'done'; result: Extract<WebCheckResult, { ok: true }> } | { kind: 'error'; message: string };
  /** 확인 창이 떠 있는지 (닫아도 서버는 켜 둠 → 도구 막대 "웹 확인 중") */
  checkOpen: boolean;
}

let snap: Snapshot = {
  mode: readMode(),
  device: readDevice(),
  scale: 1,
  edit: null,
  notice: null,
  busy: false,
  exportOpen: false,
  contentVersion: 0,
  check: null,
  checkOpen: false,
};
/** 미리보기 빈 기록을 켠 상태인지 (같은 모드를 다시 눌러도 기록이 지워지지 않게) */
let sandboxOn = false;
const listeners = new Set<() => void>();

function set(patch: Partial<Snapshot>) {
  snap = { ...snap, ...patch };
  listeners.forEach((l) => l());
  if ('mode' in patch) applyMode();
  if ('mode' in patch || 'device' in patch) applyDevice();
}

export function useEditor(): Snapshot {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snap,
  );
}

/** 편집 모드에서는 플레이어의 자동 동작을 잠시 끔: 자동 읽기·연습 먼저 하기·손가락 안내·처음 셋업 창·빛 고리·바늘 사진 가리기(가린 사진도 편집하게) */
function applyMode() {
  const editing = isEditor && snap.mode === 'edit';
  const previewing = isEditor && snap.mode === 'preview';
  if (previewing !== sandboxOn) {
    sandboxOn = previewing;
    setSandbox(previewing);
  }
  document.body.classList.toggle('is-previewing', previewing);
  setSettingOverrides(editing ? { readAloud: false, practiceGate: false, guideHand: false, showSetup: false, hideNeedle: false } : {});
  fx.setPaused('editor', editing);
  document.body.classList.toggle('is-editor', isEditor);
  document.body.classList.toggle('is-editing', editing);
}

/** 미리보기 기기 크기 적용: .stage 를 그 크기로, 화면(도구 막대 아래)보다 크면 비율 그대로 줄임 (editor.css "미리보기") */
function applyDevice() {
  const dev = DEVICES.find((d) => d.id === snap.device);
  const on = isEditor && snap.mode === 'preview' && !!dev?.w && !!dev?.h;
  document.body.classList.toggle('pv-device', on);
  if (!on || !dev?.w || !dev.h) {
    if (snap.scale !== 1) {
      snap = { ...snap, scale: 1 };
      listeners.forEach((l) => l());
    }
    return;
  }
  const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ed-top')) || 56;
  const scale = Math.min(1, (window.innerWidth - 48) / (dev.w + 24), (window.innerHeight - top - 48) / (dev.h + 24));
  const root = document.documentElement.style;
  root.setProperty('--pv-w', `${dev.w}px`);
  root.setProperty('--pv-h', `${dev.h}px`);
  root.setProperty('--pv-scale', String(Math.round(scale * 1000) / 1000));
  if (Math.abs(snap.scale - scale) > 0.001) {
    snap = { ...snap, scale };
    listeners.forEach((l) => l());
  }
}

export function setDevice(device: DeviceId): void {
  try {
    window.localStorage.setItem(DEVICE_KEY, device);
  } catch {
    // 기억 못 해도 이번에는 바뀜
  }
  set({ device });
}

/** 미리보기를 처음부터: 빈 기록으로 다시 시작하고 첫 화면으로 (처음 셋업 창부터) */
export function restartPreview(): void {
  setSandbox(true);
  sandboxOn = true;
  navigate({ name: 'home' });
}

export function setMode(mode: EditorMode): void {
  try {
    window.sessionStorage.setItem(MODE_KEY, mode);
  } catch {
    // 저장소가 막혀도 이번 화면에서는 바뀜
  }
  set({ mode });
}

/** 웹으로 내보내기 창 열기·닫기 (도구 막대·메뉴 Ctrl+B) */
export function setExportOpen(exportOpen: boolean): void {
  set({ exportOpen });
}

/**
 * 내보낸 zip 확인 시작 (내보내기 창 "브라우저에서 확인" = last, 메뉴 Ctrl+Shift+B = 고르기 창).
 * 앱이 zip 을 점검하고 잠깐 웹서버를 켜 기본 브라우저로 엶 (src/main/webCheck.ts). 고르기를 취소하면 하던 확인 그대로
 */
export async function startCheck(last: boolean): Promise<void> {
  if (!window.ssApp) return;
  const before = snap.check;
  set({ check: { kind: 'working' }, checkOpen: true, exportOpen: false });
  const result = await window.ssApp.checkExport(last);
  if (result.ok) set({ check: { kind: 'done', result } });
  else if (result.canceled) set({ check: before, checkOpen: !!before && before.kind !== 'working' });
  else set({ check: { kind: 'error', message: result.message ?? '알 수 없는 오류' } });
}

export function setCheckOpen(checkOpen: boolean): void {
  set({ checkOpen });
}

/** 확인 끝내기: 잠깐 웹서버를 끄고 창을 닫음 */
export async function stopCheck(): Promise<void> {
  await window.ssApp?.stopCheck();
  set({ check: null, checkOpen: false });
}

let noticeTimer = 0;
export function showNotice(text: string): void {
  window.clearTimeout(noticeTimer);
  set({ notice: text });
  noticeTimer = window.setTimeout(() => set({ notice: null }), 6000);
}

/**
 * 화면을 다시 띄운 뒤에 할 일 (편집을 적용하면 앱이 화면을 새로 띄워서 그 전의 화면 상태는 사라짐)
 *   goto   = 그 페이지로 (새 단계·옮긴 단계)
 *   focus  = 그 글 칸에 다시 커서 (글 칸을 고치고 다음 칸으로 넘어가던 중)
 *   notice = 안내 한 줄
 */
export interface AfterReload {
  goto?: Route;
  focus?: string;
  notice?: string;
}
const AFTER_KEY = 'editor:after-reload';

function writeAfter(after: AfterReload | null): void {
  try {
    if (after) window.sessionStorage.setItem(AFTER_KEY, JSON.stringify(after));
    else window.sessionStorage.removeItem(AFTER_KEY);
  } catch {
    // 저장소가 막히면 다시 띄운 뒤의 할 일만 빠짐
  }
}

let pendingFocus: string | null = null;

/**
 * 고치는 중인 글 칸 (아직 앱에 안 보낸 글). 저장·내보내기·닫기 전에 앱이 먼저 보내게 함 (window.__edFlush)
 * → 글을 친 채 Ctrl+S 를 눌러도 그 글까지 저장됨
 */
const flushers = new Set<() => Promise<unknown>>();

export function registerFlush(flush: () => Promise<unknown>): () => void {
  flushers.add(flush);
  return () => flushers.delete(flush);
}

/** 다시 띄운 뒤 이 글 칸에 커서를 둘 차례인지 (한 번만 true) */
export function takeFocus(key: string): boolean {
  if (pendingFocus !== key) return false;
  pendingFocus = null;
  return true;
}

/**
 * 편집 적용. 보통은 성공하면 앱이 화면을 다시 띄움 (그동안 busy).
 * live = 원고 글만 바꾸는 편집 → 화면을 다시 띄우지 않고 읽어 둔 원고를 같은 자리만 고쳐 플레이어를 새로 그림
 *   (다시 띄우면 열린 창·누르던 버튼·고치던 칸이 사라짐: 글 칸에서 "저장"을 누르면 저장이 끊겼음)
 */
export async function applyEdit(ops: EditOp[], label: string, options: { after?: AfterReload; live?: boolean } = {}): Promise<boolean> {
  if (!window.ssApp) return false;
  const live = !!options.live && ops.every((op) => op.kind === 'json');
  if (!live) set({ busy: true });
  // 앱이 화면을 다시 띄우는 때가 답보다 먼저일 수 있어서 미리 적어 둠
  writeAfter(live ? null : (options.after ?? null));
  const res = await window.ssApp.applyEdit(ops, label, { reload: !live });
  if (!res.ok) {
    writeAfter(null);
    set({ busy: false });
    showNotice(`바꾸지 못했어요: ${res.message}`);
    return false;
  }
  if (live) {
    for (const op of ops) if (op.kind === 'json') patchProject(op.file, op.pointer, op.value);
    set({ contentVersion: snap.contentVersion + 1 }); // 편집기 칸 다시 그리기
    bumpContentVersion(); // 플레이어 페이지 다시 그리기
  }
  return true;
}

/** 읽어 둔 원고의 한 칸을 앱(src/main/project.ts setByPointer)과 똑같이 고침 */
function patchProject(file: string, pointer: string, value: unknown): void {
  const data = project();
  const examId = /^exams\/(.+)\.json$/.exec(file)?.[1];
  let node: unknown = file === 'hospital.json' ? data.hospital : data.exams.find((e) => e.id === examId);
  const parts = pointer
    .split('/')
    .slice(1)
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  for (const part of parts.slice(0, -1)) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  if (!node || typeof node !== 'object') return;
  const last = parts[parts.length - 1];
  const target = node as Record<string, unknown>;
  if (value === undefined) {
    if (Array.isArray(target)) target.splice(Number(last), 1);
    else delete target[last];
  } else target[last] = value;
}

function runAfterReload(): void {
  let after: AfterReload | null = null;
  try {
    after = JSON.parse(window.sessionStorage.getItem(AFTER_KEY) ?? 'null') as AfterReload | null;
  } catch {
    after = null;
  }
  writeAfter(null);
  if (!after) return;
  if (after.goto) navigate(after.goto, { replace: true });
  if (after.focus) pendingFocus = after.focus;
  if (after.notice) showNotice(after.notice);
}

/** 편집기 시작 (boot.tsx): 모드 적용, 저장 상태 받기, 메뉴의 편집 모드·미리보기 듣기 */
export function startEditor(): void {
  if (!window.ssApp) return;
  applyMode();
  applyDevice();
  runAfterReload();
  window.__edFlush = () => Promise.all([...flushers].map((f) => f())).then(() => undefined);
  window.addEventListener('resize', applyDevice);
  // 사진·소리 자리 밖에 파일을 떨어뜨리면 창이 그 파일로 넘어가 버림 → 막음 (자리에서는 각자 받음)
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
  void window.ssApp.getEditState().then((edit) => set({ edit }));
  window.ssApp.onEditState((edit) => set({ edit }));
  window.ssApp.onMode((mode) => setMode(mode === 'preview' ? 'preview' : 'edit'));
  window.ssApp.onExport(() => setExportOpen(true));
  window.ssApp.onCheck(() => void startCheck(false));
}
