// 앱 창 = 편집기 (Electron 메인 프로세스, electron-vite 가 out/main/index.js 로 빌드) — CLAUDE.md 1-c
// 프로젝트(.ssproj) 새로 만들기·열기·저장 + 파일 메뉴 (②단계), 편집 모드(③)·미리보기(④)는 화면 쪽 src/renderer/src/editor,
// 파일 → 웹으로 내보내기 = zip 하나 (⑤단계, ./exportWeb.ts).
//
// 화면 주소
//   설치한 앱·yarn app: 같이 빌드한 화면(out/renderer)을 앱 전용 주소 app://player/ 로 연다 (file:// 에서는 fetch 가 안 됨)
//   yarn dev: electron-vite 개발 서버 주소를 띄운다 → 코드를 저장하면 창이 바로 바뀐다.
//     이미 켜진 개발 서버(예: yarn dev:web)에 창만 붙일 때는 tools/dev-app.mjs 가 SOCIAL_STORY_DEV_URL 로 그 주소를 알려 줌.
// 프로젝트 내용: 화면이 window.ssApp.getProject() 로 원고를 받고(src/preload), 사진·소리는 project://media/<경로> 로 받음.
// 주의: 주소(origin)가 바뀌면 기기 저장(localStorage)도 따로임 — 예전 file:// 로 열던 앱의 진행 기록은 이어지지 않음
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell, type MenuItemConstructorOptions } from 'electron';
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { exportWeb } from './exportWeb';
import { ProjectSession, withSsprojExt, type EditOp } from './project';
import { SSPROJ_EXT, SsprojError } from './ssproj';
import { checkWebZip, WebCheckServer, type CheckItem } from './webCheck';
import { readZip } from './zip';

const devUrl = process.env.SOCIAL_STORY_DEV_URL || (!app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined);

const APP_NAME = '병원 검사 연습 편집기';
const PLAYER_SCHEME = 'app';
const MEDIA_SCHEME = 'project';
const APP_URL = `${PLAYER_SCHEME}://player/index.html`;
const MEDIA_BASE = `${MEDIA_SCHEME}://media/`;
const RENDERER_DIR = join(import.meta.dirname, '..', 'renderer');
/** 웹으로 내보내기의 틀 = 편집기 코드 없는 플레이어 (tools/build-player.mjs → out/player, 설치한 앱은 app.asar 안) */
const PLAYER_DIR = join(import.meta.dirname, '..', 'player');
/** app/ 폴더 (개발 때만 씀: 기본 틀·공통 그림을 소스에서 바로 읽음) */
const APP_ROOT = join(import.meta.dirname, '..', '..');
/**
 * 발표 자료 (문서 메뉴 → 새 창, CLAUDE.md 5-1c). 설치한 앱은 resources/presentation (electron-builder.yml extraResources),
 * 저장소에서 띄울 때(yarn app·yarn dev)는 저장소의 presentation/. 없으면 메뉴도 안 보임
 */
const SLIDES_DIR = app.isPackaged ? join(process.resourcesPath, 'presentation') : join(APP_ROOT, '..', 'presentation');
const SLIDES_SCHEME = 'slides';
const SLIDES_URL = `${SLIDES_SCHEME}://deck/index.html`;

protocol.registerSchemesAsPrivileged([
  { scheme: PLAYER_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  // 발표 자료: 상대 경로(img/…)가 그대로 풀리게 표준 주소로
  { scheme: SLIDES_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  // 개발 서버(http) 화면에서도 사진·소리를 받으므로 corsEnabled
  { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

// ---- 로그 파일: %APPDATA%\병원 검사 연습\logs\app.log ----
// 태블릿에서 문제가 생기면 이 파일을 보면 됨 (인터넷·같은 와이파이 필요 없음)
function logFolder(): string {
  return join(app.getPath('userData'), 'logs');
}

function writeLog(level: string, message: string): void {
  const dir = logFolder();
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'app.log');
  // 1MB 가 넘으면 예전 것은 app.old.log 로
  if (existsSync(file) && statSync(file).size > 1024 * 1024) {
    renameSync(file, join(dir, 'app.old.log'));
  }
  appendFileSync(file, `${new Date().toISOString()} [${level}] ${message}\n`);
}

// ---- 프로젝트 ----
// 기본 틀: 설치한 앱은 resources/template (electron-builder.yml extraResources), 개발 때는 hospitals/SampleHospital
// 공통 그림: 설치한 앱은 화면 빌드 안 content/, 개발 때는 소스 src/renderer/public/content
const session = new ProjectSession({
  workRoot: join(app.getPath('userData'), 'work'),
  templateDir: app.isPackaged ? join(process.resourcesPath, 'template') : join(APP_ROOT, '..', 'hospitals', 'SampleHospital'),
  commonDir: app.isPackaged ? join(RENDERER_DIR, 'content') : join(APP_ROOT, 'src', 'renderer', 'public', 'content'),
  appVersion: app.getVersion(),
});

let win: BrowserWindow | null = null;

/** 창 제목·편집 메뉴(되돌리기·다시 하기 켜기)·화면 도구 막대(저장 상태)를 지금 프로젝트에 맞춤 */
function updateTitle(): void {
  win?.setTitle(`${session.displayName}${session.dirty ? ' *' : ''} - ${APP_NAME}`);
  const state = session.editState();
  const menu = Menu.getApplicationMenu();
  const undo = menu?.getMenuItemById('undo');
  const redo = menu?.getMenuItemById('redo');
  if (undo) undo.enabled = state.canUndo;
  if (redo) redo.enabled = state.canRedo;
  win?.webContents.send('edit:state', state);
}

/** 프로젝트·원고가 바뀌면 화면을 다시 띄움 (화면은 시작할 때 프로젝트를 읽음, 주소 #/… 는 그대로라 보던 페이지로 돌아옴) */
function reloadPlayer(): void {
  updateTitle();
  win?.webContents.reload();
}

async function undo(): Promise<void> {
  try {
    if (await session.undo()) reloadPlayer();
  } catch (err) {
    showError('되돌리지 못했어요', err);
  }
}

async function redo(): Promise<void> {
  try {
    if (await session.redo()) reloadPlayer();
  } catch (err) {
    showError('다시 하지 못했어요', err);
  }
}

// 자동 저장: 저장한 적 있는 프로젝트에 바뀐 내용이 있으면 2분마다 그 파일에 저장 (새 프로젝트는 이름이 없어서 안 함 → 도구 막대가 "저장해 주세요")
const AUTOSAVE_MS = 2 * 60 * 1000;
let autosaving = false;
setInterval(() => {
  if (!session.dirty || !session.filePath || autosaving) return;
  autosaving = true;
  session
    .save(session.filePath, true)
    .then(() => {
      writeLog('info', `자동 저장: ${session.filePath}`);
      updateTitle();
    })
    .catch((err) => writeLog('error', `자동 저장 실패: ${err instanceof Error ? err.message : err}`))
    .finally(() => {
      autosaving = false;
    });
}, AUTOSAVE_MS);

function showError(title: string, err: unknown): void {
  const detail = err instanceof SsprojError || err instanceof Error ? err.message : String(err);
  writeLog('error', `${title}: ${detail}`);
  if (win) void dialog.showMessageBox(win, { type: 'warning', title: APP_NAME, message: title, detail });
}

/**
 * 화면에서 고치는 중인 글(아직 안 보낸 글 칸)을 먼저 받음 → 글을 친 채 저장·내보내기·닫기를 해도 그 글까지 들어감.
 * 화면을 다시 띄우는 중이면 답이 늦을 수 있어서 3초까지만 기다림
 */
async function flushEdits(): Promise<void> {
  if (!win) return;
  try {
    await Promise.race([
      win.webContents.executeJavaScript('window.__edFlush ? window.__edFlush() : null', true),
      new Promise((done) => setTimeout(done, 3000)),
    ]);
  } catch {
    // 화면이 없거나 다시 띄우는 중이면 그대로
  }
}

async function saveAs(): Promise<boolean> {
  if (!win) return false;
  await flushEdits();
  const res = await dialog.showSaveDialog(win, {
    title: '다른 이름으로 저장',
    defaultPath: `${session.displayName}${SSPROJ_EXT}`,
    filters: [{ name: '병원 검사 연습 프로젝트', extensions: ['ssproj'] }],
  });
  if (res.canceled || !res.filePath) return false;
  try {
    await session.save(withSsprojExt(res.filePath));
    updateTitle();
    return true;
  } catch (err) {
    showError('저장하지 못했어요', err);
    return false;
  }
}

async function save(): Promise<boolean> {
  await flushEdits();
  if (!session.filePath) return saveAs();
  try {
    await session.save();
    updateTitle();
    return true;
  } catch (err) {
    showError('저장하지 못했어요', err);
    return false;
  }
}

/** 저장 안 한 내용이 있으면 물어봄. 계속해도 되면 true */
async function confirmDiscard(): Promise<boolean> {
  await flushEdits();
  if (!session.dirty || !win) return true;
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    title: APP_NAME,
    message: `"${session.displayName}"에 저장하지 않은 내용이 있어요. 저장할까요?`,
    buttons: ['저장', '저장 안 함', '취소'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  if (response === 0) return save();
  return response === 1;
}

async function newProject(): Promise<void> {
  if (!(await confirmDiscard())) return;
  try {
    await session.newProject();
    reloadPlayer();
  } catch (err) {
    showError('새 프로젝트를 만들지 못했어요', err);
  }
}

async function openProject(filePath?: string): Promise<void> {
  if (!win || !(await confirmDiscard())) return;
  let target = filePath;
  if (!target) {
    const res = await dialog.showOpenDialog(win, {
      title: '프로젝트 열기',
      properties: ['openFile'],
      filters: [{ name: '병원 검사 연습 프로젝트', extensions: ['ssproj'] }],
    });
    if (res.canceled || !res.filePaths[0]) return;
    target = res.filePaths[0];
  }
  try {
    await session.open(target);
    reloadPlayer();
  } catch (err) {
    showError('프로젝트를 열지 못했어요', err);
  }
}

// ---- 웹으로 내보내기 (⑤단계) ----
/** 마지막으로 내보낸 zip (화면의 "폴더에서 보기"는 이 파일만 보여 줌) */
let lastExport: string | null = null;

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** 저장 대화창 → zip 쓰기. 화면이 빠진 것을 먼저 보여 주고 "내보내기"를 누르면 부름 */
async function exportWebZip(): Promise<{ ok: true; file: string; bytes: number; count: number } | { ok: false; canceled?: boolean; message?: string }> {
  if (!win) return { ok: false, canceled: true };
  await flushEdits();
  let hospitalId = 'project';
  try {
    hospitalId = (await session.projectData()).hospital.id || hospitalId;
  } catch {
    // 원고를 못 읽으면 아래 exportWeb 이 이유를 알려 줌
  }
  const res = await dialog.showSaveDialog(win, {
    title: '웹으로 내보내기',
    defaultPath: join(session.filePath ? dirname(session.filePath) : app.getPath('documents'), `${hospitalId}-web-${today()}.zip`),
    filters: [{ name: 'zip 파일', extensions: ['zip'] }],
  });
  if (res.canceled || !res.filePath) return { ok: false, canceled: true };
  const file = res.filePath.toLowerCase().endsWith('.zip') ? res.filePath : `${res.filePath}.zip`;
  try {
    const out = await exportWeb(session, PLAYER_DIR, file);
    lastExport = out.file;
    writeLog('info', `웹으로 내보내기: ${out.file} (${out.count}개, ${out.bytes}바이트)`);
    return { ok: true, ...out };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeLog('error', `웹으로 내보내기 실패: ${message}`);
    return { ok: false, message };
  }
}

// ---- 문서 → 발표 자료 (새 창) ----
let slidesWin: BrowserWindow | null = null;

function hasSlides(): boolean {
  return !!SLIDES_DIR && existsSync(join(SLIDES_DIR, 'index.html'));
}

/** 발표의 "앱 열기"·"다음: 시연 ▶" (../#/) → 편집기 창을 앞으로, 미리보기의 첫 화면으로 */
function showDemo(): void {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  win.webContents.send('editor:mode', 'preview');
  void win.webContents.executeJavaScript("location.hash = '#/'").catch(() => undefined);
}

function openSlides(): void {
  if (!hasSlides()) return;
  if (slidesWin) {
    if (slidesWin.isMinimized()) slidesWin.restore();
    slidesWin.focus();
    return;
  }
  slidesWin = new BrowserWindow({
    width: 1280,
    height: 760,
    title: '발표 자료 - 병원 검사 연습',
    backgroundColor: '#16325C',
    autoHideMenuBar: true,
    icon: join(import.meta.dirname, '../../resources/icon.png'),
  });
  slidesWin.setMenuBarVisibility(false);
  void slidesWin.loadURL(SLIDES_URL);
  // 발표 안의 앱 링크(../#/ → slides://deck/#/)는 이 창에서 열지 않고 편집기로
  slidesWin.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(`${SLIDES_SCHEME}://deck/index.html`)) return;
    event.preventDefault();
    if (url.startsWith(`${SLIDES_SCHEME}://`)) showDemo();
    else if (/^https?:/.test(url)) void shell.openExternal(url);
  });
  slidesWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  slidesWin.on('closed', () => {
    slidesWin = null;
  });
}

// ---- 내보낸 zip 확인: 점검 + 앱이 잠깐 웹서버가 되어 기본 브라우저로 (./webCheck.ts) ----
const checkServer = new WebCheckServer();

type CheckResult =
  | { ok: true; file: string; url: string | null; items: CheckItem[]; count: number; bytes: number }
  | { ok: false; canceled?: boolean; message?: string };

/** file 이 없으면 zip 고르기 창 (방금 내보낸 zip 이 있는 폴더에서) */
async function checkExport(file?: string): Promise<CheckResult> {
  if (!win) return { ok: false, canceled: true };
  let target = file;
  if (!target) {
    const res = await dialog.showOpenDialog(win, {
      title: '확인할 웹 결과물 zip 고르기',
      defaultPath: lastExport ? dirname(lastExport) : session.filePath ? dirname(session.filePath) : app.getPath('documents'),
      properties: ['openFile'],
      filters: [{ name: 'zip 파일', extensions: ['zip'] }],
    });
    if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true };
    target = res.filePaths[0];
  }
  try {
    const entries = await readZip(target);
    const items = checkWebZip(entries);
    // index.html 이 맨 위에 없으면 열어 봐야 빈 화면 → 서버는 안 켬
    const url = entries.some((e) => e.path === 'index.html') ? await checkServer.start(entries) : null;
    if (url) void shell.openExternal(url);
    writeLog('info', `내보낸 zip 확인: ${target} → ${url ?? '(서버 안 켬)'} ${items.filter((i) => i.level !== 'ok').map((i) => i.label).join(' / ')}`);
    return { ok: true, file: target, url, items, count: entries.length, bytes: statSync(target).size };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeLog('error', `내보낸 zip 확인 실패: ${message}`);
    return { ok: false, message };
  }
}

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: '파일',
      submenu: [
        { id: 'new', label: '새 프로젝트', accelerator: 'CmdOrCtrl+N', click: () => void newProject() },
        { id: 'open', label: '열기…', accelerator: 'CmdOrCtrl+O', click: () => void openProject() },
        { type: 'separator' },
        { id: 'save', label: '저장', accelerator: 'CmdOrCtrl+S', click: () => void save() },
        { id: 'save-as', label: '다른 이름으로 저장…', accelerator: 'CmdOrCtrl+Shift+S', click: () => void saveAs() },
        { type: 'separator' },
        // 빠진 것을 먼저 보여 주는 창은 화면 쪽 (editor/ExportDialog.tsx)
        { id: 'export', label: '웹으로 내보내기 (빌드)…', accelerator: 'CmdOrCtrl+B', click: () => win?.webContents.send('editor:export') },
        // 점검 결과 창은 화면 쪽 (editor/CheckDialog.tsx)
        { id: 'check', label: '내보낸 zip 브라우저로 확인…', accelerator: 'CmdOrCtrl+Shift+B', click: () => win?.webContents.send('editor:check') },
        { type: 'separator' },
        { label: '끝내기', role: 'quit' },
      ],
    },
    {
      label: '편집',
      submenu: [
        { id: 'undo', label: '되돌리기', accelerator: 'CmdOrCtrl+Z', enabled: false, click: () => void undo() },
        { id: 'redo', label: '다시 하기', accelerator: 'CmdOrCtrl+Y', enabled: false, click: () => void redo() },
        // Ctrl+Shift+Z 도 다시 하기 (다른 프로그램에서 익숙한 키)
        { label: '다시 하기', accelerator: 'CmdOrCtrl+Shift+Z', visible: false, click: () => void redo() },
      ],
    },
    {
      label: '보기',
      submenu: [
        { label: '편집 모드', accelerator: 'CmdOrCtrl+E', click: () => win?.webContents.send('editor:mode', 'edit') },
        { label: '미리보기', accelerator: 'F5', click: () => win?.webContents.send('editor:mode', 'preview') },
        { type: 'separator' },
        { label: '새로고침', accelerator: 'CmdOrCtrl+R', click: () => win?.webContents.reload() },
        { label: '개발자 도구', accelerator: 'F12', click: () => win?.webContents.toggleDevTools() },
        {
          label: '로그 폴더 열기',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => {
            mkdirSync(logFolder(), { recursive: true });
            void shell.openPath(logFolder());
          },
        },
      ],
    },
  ];
  // 문서: 발표 자료가 있을 때만
  if (hasSlides()) {
    template.push({
      label: '문서',
      submenu: [{ id: 'slides', label: '발표 자료 열기', accelerator: 'CmdOrCtrl+Shift+P', click: () => openSlides() }],
    });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- 앱 전용 주소 ----
/** noStore = 캐시하지 않음 (프로젝트 사진·소리: 편집으로 같은 이름의 파일이 바뀌면 바로 새것이 보이게) */
async function serveFile(file: string, noStore = false): Promise<Response> {
  if (!existsSync(file) || !statSync(file).isFile()) return new Response('', { status: 404 });
  const res = await net.fetch(pathToFileURL(file).toString());
  if (!noStore) return res;
  const headers = new Headers(res.headers);
  headers.set('Cache-Control', 'no-store');
  return new Response(res.body, { status: res.status, headers });
}

function serveSchemes(): void {
  // app://player/… = 빌드한 화면 (out/renderer). 화면 폴더 밖은 주지 않음
  protocol.handle(PLAYER_SCHEME, (request) => {
    let path: string;
    try {
      path = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response('잘못된 주소', { status: 400 });
    }
    const file = resolve(RENDERER_DIR, `.${path}`);
    if (file !== RENDERER_DIR && !file.startsWith(RENDERER_DIR + sep)) return new Response('', { status: 403 });
    return serveFile(file);
  });
  // slides://deck/… = 저장소의 presentation/ (그 폴더 밖은 주지 않음)
  protocol.handle(SLIDES_SCHEME, (request) => {
    if (!SLIDES_DIR) return new Response('', { status: 404 });
    let path: string;
    try {
      path = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response('잘못된 주소', { status: 400 });
    }
    const file = resolve(SLIDES_DIR, `.${path === '/' ? '/index.html' : path}`);
    if (!file.startsWith(SLIDES_DIR + sep)) return new Response('', { status: 403 });
    return serveFile(file, true);
  });
  // project://media/<경로> = 열린 프로젝트의 사진·소리 (없으면 앱의 공통 그림)
  protocol.handle(MEDIA_SCHEME, (request) => {
    let path: string;
    try {
      path = decodeURIComponent(new URL(request.url).pathname).replace(/^\//, '');
    } catch {
      return new Response('잘못된 주소', { status: 400 });
    }
    const file = session.resolveMedia(path);
    return file ? serveFile(file, true) : new Response('', { status: 404 });
  });
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 820,
    height: 1180,
    backgroundColor: '#dcebff',
    // 창·작업 표시줄 아이콘 (yarn icon 이 만듦). 설치한 앱은 실행 파일 아이콘(build/icon.ico)도 같은 그림
    icon: join(import.meta.dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
    },
  });
  updateTitle();
  // 화면의 <title> 대신 프로젝트 이름을 제목으로
  win.on('page-title-updated', (event) => event.preventDefault());

  // 태블릿에서는 화면에 꽉 차게
  win.maximize();
  void win.loadURL(devUrl ?? APP_URL);

  // 저장 안 한 내용이 있으면 닫기 전에 물어봄
  let closeConfirmed = false;
  win.on('close', (event) => {
    if (!session.dirty || closeConfirmed) return;
    event.preventDefault();
    void confirmDiscard().then((ok) => {
      if (ok) {
        closeConfirmed = true;
        win?.close();
      }
    });
  });
  win.on('closed', () => {
    win = null;
    slidesWin?.close(); // 편집기를 닫으면 발표 창도 (앱이 끝나게)
  });

  // 새 창으로 여는 링크(개발 패널의 제작 방향서 PDF·시안)는 기본 브라우저로 연다
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // 화면 쪽 console.warn / console.error 를 로그 파일에 남김 (예: [사운드 없음] ...)
  win.webContents.on('console-message', (details) => {
    if (details.level === 'warning' || details.level === 'error') {
      writeLog(details.level, details.message);
    }
  });

  // 화면이 멈추거나 꺼지면 기록
  win.webContents.on('render-process-gone', (_event, details) => {
    writeLog('error', `화면 프로세스 종료: ${details.reason}`);
  });
}

/** 실행할 때 받은 인자 중 .ssproj 파일 (탐색기에서 더블클릭했을 때) */
function ssprojArg(argv: string[]): string | undefined {
  return argv.slice(1).find((a) => a.toLowerCase().endsWith(SSPROJ_EXT) && existsSync(a));
}

// 앱은 하나만: 이미 켜져 있으면 그 창에서 파일을 엶 (작업 폴더를 같이 쓰므로 둘이 동시에 돌면 안 됨)
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    const file = ssprojArg(argv);
    if (file) void openProject(file);
  });

  ipcMain.handle('project:get', async () => ({ data: await session.projectData(), mediaBase: MEDIA_BASE }));
  ipcMain.handle('edit:state', () => session.editState());
  // 편집 적용 (화면의 편집 모드가 보냄) → 성공하면 화면을 다시 띄워 새 사진·원고가 보이게. 실패하면 이유를 돌려줌
  // reload: false = 글만 고침 → 화면이 읽어 둔 원고를 스스로 고치므로 다시 띄우지 않음 (editor/editorState.ts applyEdit)
  ipcMain.handle('edit:apply', async (_event, ops: EditOp[], label: string, options?: { reload?: boolean }) => {
    try {
      await session.apply(ops, String(label || '편집'));
      writeLog('info', `편집: ${label}`);
      if (options?.reload === false) updateTitle();
      else reloadPlayer();
      return { ok: true as const };
    } catch (err) {
      writeLog('error', `편집 실패 (${label}): ${err instanceof Error ? err.message : err}`);
      return { ok: false as const, message: err instanceof Error ? err.message : String(err) };
    }
  });
  ipcMain.handle('edit:undo', () => undo());
  ipcMain.handle('edit:redo', () => redo());
  ipcMain.handle('file:save', () => save());
  ipcMain.handle('file:export', () => exportWebZip());
  ipcMain.handle('file:show-export', () => {
    if (lastExport && existsSync(lastExport)) shell.showItemInFolder(lastExport);
  });
  // 내보낸 zip 확인: last = 방금 내보낸 zip, 아니면 고르기 창 (화면이 아무 파일 경로나 넘기지 못하게). 이미 켠 확인 서버 다시 열기·끄기
  ipcMain.handle('file:check-export', (_event, last?: boolean) => checkExport(last === true && lastExport && existsSync(lastExport) ? lastExport : undefined));
  ipcMain.handle('file:check-open', () => {
    if (checkServer.url) void shell.openExternal(checkServer.url);
  });
  ipcMain.handle('file:check-stop', () => checkServer.stop());

  void app.whenReady().then(async () => {
    writeLog('info', `앱 시작 (버전 ${app.getVersion()})`);
    serveSchemes();
    buildMenu();
    await session.cleanupStale();
    const file = ssprojArg(process.argv);
    try {
      if (file) await session.open(file);
      else await session.newProject();
    } catch (err) {
      await session.newProject();
      createWindow();
      showError('프로젝트를 열지 못했어요', err);
      return;
    }
    createWindow();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
  // 끌 때 작업 폴더(프로젝트를 풀어 둔 곳)를 지움. 강제로 꺼져 남으면 다음에 켤 때 지움 (cleanupStale)
  app.on('will-quit', () => {
    void checkServer.stop();
    if (session.workDir) rmSync(session.workDir, { recursive: true, force: true });
  });
}
