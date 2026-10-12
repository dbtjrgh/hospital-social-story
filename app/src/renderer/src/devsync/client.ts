// 태블릿↔PC 실시간 동기화 — 브라우저 쪽 (개발 서버 전용, CLAUDE.md 5장)
// main.tsx 가 import.meta.env.DEV 일 때만 동적으로 불러옴 → 납품 빌드(dist)에는 이 파일이 없음.
// 서버(tools/devsync-plugin.ts)는 받은 메시지를 모든 기기에 그대로 돌려보냄 → 자기 id 가 붙은 메시지는 무시.
import type { eventWithTime } from 'rrweb';
import rrwebCss from 'rrweb/dist/style.css?inline';
import type { CustomEventMap, InferCustomEventPayload } from 'vite/types/customEvent.d.ts';
import { getState, resetAll, setStateFromRemote, subscribeStore, type AppState } from '../lib/store';
import { deviceColor, mountDebugPanel } from './DebugPanel';
import css from './devsync.css?inline';
import type {
  CommandMsg,
  CommandName,
  DeviceInfo,
  DeviceKind,
  DeviceRow,
  EntryKind,
  HistoryEntry,
  MirrorControlMsg,
  MirrorEventsMsg,
  MirrorWatchMsg,
  NavMsg,
  ServerInfo,
  StateMsg as AnyStateMsg,
  TapMsg,
} from './protocol';

// 메시지 모양은 protocol.ts (서버 플러그인도 같이 씀)
type StateMsg = AnyStateMsg<AppState>;

declare module 'vite/types/customEvent.d.ts' {
  interface CustomEventMap {
    'devsync:hello': DeviceInfo;
    'devsync:heartbeat': DeviceInfo;
    'devsync:devices': { devices: DeviceRow[] };
    'devsync:info': ServerInfo;
    'devsync:history': { entries: HistoryEntry[] };
    'devsync:nav': NavMsg;
    'devsync:state': StateMsg;
    'devsync:tap': TapMsg;
    'devsync:command': CommandMsg;
    'devsync:log': HistoryEntry;
    'devsync:event': HistoryEntry;
    'devsync:mirror:watch': MirrorWatchMsg;
    'devsync:mirror:control': MirrorControlMsg;
    'devsync:mirror:events': MirrorEventsMsg;
  }
}

// ───────── 패널이 읽는 작은 저장소 ─────────

export interface LogEntry extends HistoryEntry {
  /** 받은 순서 (화면 정렬·React key) */
  key: number;
  self: boolean;
}

export interface DevSyncSnapshot {
  self: { id: string; name: string; kind: DeviceKind; follow: boolean };
  connected: boolean;
  devices: DeviceRow[];
  /** 기기 목록을 받은 이 기기 시각 → "몇 초 전" 계산용 */
  devicesAt: number;
  info: ServerInfo | null;
  /** 오류·경고 (최근 100개) */
  logs: LogEntry[];
  /** 진행 이벤트·원격 명령·연결 알림 (최근 100개) */
  events: LogEntry[];
}

export interface DevSyncApi {
  subscribe(cb: () => void): () => void;
  getSnapshot(): DevSyncSnapshot;
  setFollow(on: boolean): void;
  sendCommand(command: CommandName): void;
  /** 이 기기만 그 화면으로 이동 (패널의 "이 화면으로" 버튼) */
  goTo(route: string): void;
  clearEntries(): void;
  /** 다른 기기 화면을 그대로 보기 시작. onEvents 로 rrweb 이벤트(주소를 이 기기 것으로 되돌린 것)를 받음. 돌려준 함수 = 그만 보기 */
  watchScreen(target: string, onEvents: MirrorListener): () => void;
}

const HEARTBEAT_MS = 5000;
const ENTRY_MAX = 100;
const MAX_LEN = 2000;
const LOGS_PER_SEC = 20;
const ID_KEY = 'devsync:id';
const FOLLOW_KEY = 'devsync:follow';

export const COMMAND_LABEL: Record<CommandName, string> = {
  reload: '모든 기기 새로고침',
  home: '모든 기기 처음으로',
  reset: '진행 초기화',
};

type Hot = NonNullable<ImportMeta['hot']>;

let hot: Hot | null = null;
let started = false;
/** 연결이 끊긴 동안 보내면 Vite 가 console.error 를 찍음 → 그걸 또 보내는 반복을 막으려고 안 보냄 */
let connected = true;
/** 원격 명령·원격 상태를 적용하는 중 → 저장소 변화를 다시 방송하지 않음 */
let applyingRemote = false;

// sessionStorage 는 개인 정보 보호 모드 등에서 막힐 수 있음
function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeSession(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // 저장 못 해도 이번 화면에서는 동작
  }
}

function makeId(): string {
  try {
    // LAN 주소(http)는 보안 컨텍스트가 아니라 randomUUID 가 없을 수 있음
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    // 아래 대체 방법
  }
  return `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function browserName(ua: string): string {
  if (/Electron\//.test(ua)) return 'Electron'; // yarn dev 의 앱 창
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Whale\//.test(ua)) return 'Whale';
  if (/SamsungBrowser\//.test(ua)) return '삼성 인터넷';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return '브라우저';
}

function detectDevice(): { name: string; kind: DeviceKind } {
  const ua = navigator.userAgent;
  const touch = navigator.maxTouchPoints > 1;
  // iPadOS Safari 는 Mac 처럼 보고함 → 터치가 되는 Mac 은 iPad
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch)) return { name: 'iPad', kind: 'tablet' };
  if (/iPhone|iPod/.test(ua)) return { name: 'iPhone', kind: 'phone' };
  if (/Android/.test(ua)) {
    return /Mobile/.test(ua) ? { name: 'Android 폰', kind: 'phone' } : { name: 'Android 태블릿', kind: 'tablet' };
  }
  // 큰 안드로이드 태블릿의 Chrome 은 기본이 "데스크톱 사이트" → Linux 로 보고함
  if (/Linux/.test(ua) && !/CrOS/.test(ua) && touch) return { name: 'Android 태블릿', kind: 'tablet' };
  return { name: `PC ${browserName(ua)}`, kind: 'pc' };
}

const device = detectDevice();
const id = readSession(ID_KEY) ?? makeId();
writeSession(ID_KEY, id);
const name = device.name;

let snap: DevSyncSnapshot = {
  self: { id, name, kind: device.kind, follow: readSession(FOLLOW_KEY) !== '0' },
  connected: true,
  devices: [],
  devicesAt: Date.now(),
  info: null,
  logs: [],
  events: [],
};
const subscribers = new Set<() => void>();
let notifyQueued = false;

function update(patch: Partial<DevSyncSnapshot>): void {
  snap = { ...snap, ...patch };
  // React 가 그리는 도중에 console.error 가 불려도 안전하도록 알림은 한 박자 뒤에 모아서
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => {
    notifyQueued = false;
    subscribers.forEach((cb) => cb());
  });
}

let entryKey = 0;
function addEntry(entry: HistoryEntry, self: boolean): void {
  const item: LogEntry = { ...entry, key: ++entryKey, self };
  if (entry.kind === 'error' || entry.kind === 'warn') update({ logs: [...snap.logs, item].slice(-ENTRY_MAX) });
  else update({ events: [...snap.events, item].slice(-ENTRY_MAX) });
}

function send<T extends keyof CustomEventMap>(event: T, data: InferCustomEventPayload<T>): void {
  if (!hot || !connected) return;
  try {
    hot.send(event, data);
  } catch {
    // 보내기 실패는 조용히 넘김 (로그로 남기면 또 보내려다 반복될 수 있음)
  }
}

const currentRoute = () => window.location.hash || '#/';

function deviceInfo(): DeviceInfo {
  return {
    id,
    name,
    kind: device.kind,
    vw: window.innerWidth,
    vh: window.innerHeight,
    route: currentRoute(),
    follow: snap.self.follow,
    ua: navigator.userAgent,
  };
}

const heartbeat = () => send('devsync:heartbeat', deviceInfo());

// ───────── 화면 따라가기 ─────────

/** 원격으로 바꾼 해시. 이 해시로 생긴 hashchange 는 다시 방송하지 않음 (무한 왕복 방지) */
const remoteHashes: { hash: string; t: number }[] = [];

function applyRoute(route: string): void {
  const target = route || '#/';
  // 이미 같은 화면이면 hashchange 가 안 생김 → 표시를 남기면 다음 진짜 이동을 삼키므로 그냥 끝
  if (currentRoute() === target) return;
  window.location.hash = target;
  remoteHashes.push({ hash: currentRoute(), t: Date.now() });
  if (remoteHashes.length > 10) remoteHashes.shift();
}

function onHashChange(e: HashChangeEvent): void {
  let hash = currentRoute();
  try {
    // 이벤트가 늦게 처리돼도 "그때의" 주소로 판단 (router.navigate 의 replace 는 newURL 이 비어 있음)
    if (e.newURL) hash = new URL(e.newURL).hash || '#/';
  } catch {
    // 현재 주소로 판단
  }
  const now = Date.now();
  while (remoteHashes.length > 0 && now - remoteHashes[0].t > 1000) remoteHashes.shift();
  heartbeat();
  const i = remoteHashes.findIndex((r) => r.hash === hash);
  if (i >= 0) {
    remoteHashes.splice(i, 1);
    return;
  }
  send('devsync:nav', { from: id, name, route: hash });
}

// ───────── 진행 상태 동기화 ─────────

let stateTimer: number | undefined;

// 막 들어온 기기(또는 따라가기를 막 켠 기기)는 다른 기기 상태를 받을 때까지(최대 JOIN_WAIT_MS) 내 상태를 보내지 않음.
// 예전에는 늦게 들어온 기기가 셋업 등으로 저장소를 건드리는 순간 빈 기록을 통째로 보내 다른 기기 기록을 지웠음 (10-07 검수)
const JOIN_WAIT_MS = 1500;
let joining = false;
let joinTimer: number | undefined;

function askState(): void {
  if (!snap.self.follow) return;
  joining = true;
  window.clearTimeout(joinTimer);
  joinTimer = window.setTimeout(() => {
    joining = false;
  }, JOIN_WAIT_MS);
  send('devsync:state', { from: id, name, ask: true });
}

function onStoreChange(_state: AppState, meta: { remote: boolean }): void {
  if (meta.remote || applyingRemote || joining) return;
  // 소리 크기 슬라이더처럼 연달아 바뀌면 마지막 것만 보냄
  if (stateTimer !== undefined) return;
  stateTimer = window.setTimeout(() => {
    stateTimer = undefined;
    send('devsync:state', { from: id, name, state: getState() });
  }, 80);
}

function onRemoteState(msg: StateMsg): void {
  if (msg.from === id) return;
  if (msg.ask) {
    // 막 들어온 기기가 물어봄 → 내 상태를 알려 줌 (나도 기다리는 중이면 빈 기록일 수 있어 안 보냄)
    if (!joining && snap.self.follow) send('devsync:state', { from: id, name, state: getState() });
    return;
  }
  if (!snap.self.follow || !msg.state) return;
  joining = false;
  window.clearTimeout(joinTimer);
  // 곧 보낼 예정이던 내 상태는 덮어써지므로 취소 (받은 상태를 되돌려 보내지 않게)
  if (stateTimer !== undefined) {
    window.clearTimeout(stateTimer);
    stateTimer = undefined;
  }
  try {
    setStateFromRemote(msg.state);
  } catch {
    // 모양이 다른 상태(예전 버전)면 무시
  }
}

// ───────── 원격 명령 ─────────

function runCommand(command: CommandName): void {
  if (command === 'reload') window.location.reload();
  else if (command === 'home') applyRoute('#/');
  else if (command === 'reset') {
    // resetAll 은 저장소 구독자를 바로(동기) 부름 → 이 동안은 방송하지 않음. 기기마다 각자 지우므로 핑퐁 없음
    applyingRemote = true;
    try {
      resetAll();
    } finally {
      applyingRemote = false;
    }
  }
}

function sendCommand(command: CommandName): void {
  send('devsync:command', { from: id, name, command });
  addEntry({ kind: 'command', from: id, name, message: COMMAND_LABEL[command], route: currentRoute(), t: Date.now() }, true);
  // 새로고침은 메시지가 나갈 시간을 조금 줌
  if (command === 'reload') window.setTimeout(() => runCommand('reload'), 200);
  else runCommand(command);
}

// ───────── 터치 표시 ─────────

function frameRect(): DOMRect {
  return (document.querySelector('[data-app-frame]') ?? document.body).getBoundingClientRect();
}

function reduceMotion(): boolean {
  const setting = getState().settings.reduceMotion;
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function drawTap(layer: HTMLElement, msg: TapMsg): void {
  if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
  const r = frameRect();
  const dot = document.createElement('div');
  dot.className = reduceMotion() ? 'ds-tap ds-tap--still' : 'ds-tap';
  dot.style.left = `${r.left + msg.x * r.width}px`;
  dot.style.top = `${r.top + msg.y * r.height}px`;
  dot.style.setProperty('--ds-tap-color', deviceColor(msg.from));
  const label = document.createElement('span');
  label.className = 'ds-tap-label';
  label.textContent = msg.route === currentRoute() ? msg.name : `${msg.name} · 다른 화면`;
  dot.append(label);
  layer.append(dot);
  const done = () => dot.remove();
  dot.addEventListener('animationend', done, { once: true });
  window.setTimeout(done, 1000);
}

// ───────── 로그 모으기 ─────────

function truncate(text: string, max = MAX_LEN): string {
  return text.length > max ? `${text.slice(0, max)}…(잘림)` : text;
}

function formatArg(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) {
    const head = `${value.name}: ${value.message}`;
    // Safari 의 stack 에는 메시지가 없음 → 앞에 붙임
    return value.stack ? (value.stack.includes(value.message) ? value.stack : `${head}\n${value.stack}`) : head;
  }
  if (typeof Element !== 'undefined' && value instanceof Element) {
    return `<${value.tagName.toLowerCase()}${value.id ? `#${value.id}` : ''}>`;
  }
  if (value === undefined) return 'undefined';
  if (typeof value === 'function') return `[function ${value.name || '익명'}]`;
  if (typeof value === 'object' && value !== null) {
    try {
      const seen = new WeakSet<object>();
      return JSON.stringify(value, (_key, v: unknown) => {
        if (typeof v === 'bigint') return v.toString();
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return '[순환]';
          seen.add(v);
        }
        return v;
      });
    } catch {
      return Object.prototype.toString.call(value);
    }
  }
  return String(value);
}

/** 연결이 끊겼을 때 Vite 가 찍는 오류 — 보내 봐야 또 실패하므로 버림 */
function isTransportNoise(text: string): boolean {
  return /send was called before connect|SendBeforeConnectError|\[vite\] failed to connect to websocket/.test(text);
}

let capturing = false;
let rateStart = 0;
let rateCount = 0;
let dropped = 0;

function capture(level: 'error' | 'warn', makeText: () => string): void {
  // 보내는 중에 난 오류가 다시 여기로 들어오는 것을 막음
  if (capturing) return;
  capturing = true;
  try {
    const now = Date.now();
    if (now - rateStart >= 1000) {
      const skipped = dropped;
      rateStart = now;
      rateCount = 0;
      dropped = 0;
      if (skipped > 0) emit('warn', `[devsync] 로그가 너무 많아 ${skipped}개를 건너뜀`);
    }
    if (rateCount >= LOGS_PER_SEC) {
      dropped += 1;
      return;
    }
    const text = makeText();
    if (isTransportNoise(text)) return;
    rateCount += 1;
    emit(level, text);
  } catch {
    // 로그를 모으다 난 오류는 무시 (앱 동작에 영향 주지 않게)
  } finally {
    capturing = false;
  }
}

function emit(kind: EntryKind, message: string): void {
  const entry: HistoryEntry = { kind, from: id, name, message: truncate(message), route: currentRoute(), t: Date.now() };
  addEntry(entry, true);
  send(kind === 'event' ? 'devsync:event' : 'devsync:log', entry);
}

function hookConsole(): void {
  (['error', 'warn'] as const).forEach((level) => {
    const original = console[level];
    console[level] = (...args: unknown[]) => {
      // 원래 동작(개발자 도구 출력)은 그대로
      original.apply(console, args);
      capture(level, () => args.map(formatArg).join(' '));
    };
  });
}

function hookErrors(): void {
  window.addEventListener(
    'error',
    (e: Event) => {
      const target = e.target;
      // 캡처 단계라서 img·audio 같은 리소스 로드 실패도 잡힘 (사진 경로 오타 찾기에 유용)
      if (target instanceof Element) {
        const src = target.getAttribute('src') ?? target.getAttribute('href') ?? '';
        capture('error', () => `리소스 로드 실패 <${target.tagName.toLowerCase()}> ${src}`);
        return;
      }
      const err = e as ErrorEvent;
      capture('error', () =>
        err.error !== undefined && err.error !== null
          ? formatArg(err.error)
          : `${err.message} (${err.filename}:${err.lineno}:${err.colno})`,
      );
    },
    true,
  );
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    capture('error', () => `처리 안 된 Promise 거부: ${formatArg(e.reason)}`);
  });
}

// ───────── 화면 그대로 보기 (rrweb) ─────────
// 찍히는 기기: 누군가 이 기기를 보고 있을 때만 녹화 (서버가 devsync:mirror:control 로 알려 줌). 패널(#devsync-root)은 빼고 찍음.
// 사진·글꼴 주소에 든 이 기기 주소(태블릿이면 PC의 와이파이 주소)는 ORIGIN_TOKEN 으로 바꿔 보내고, 보는 기기가 자기 주소로 되돌림
// → 보는 쪽은 같은 개발 서버에서 바로 받음. Pixi 효과(캔버스)는 찍지 않음.

const ORIGIN_TOKEN = 'devsync-origin:';
const MIRROR_BATCH_MS = 100;

let wantRecord = false;
let recordLoading = false;
let stopRecord: (() => void) | null = null;
let takeFullSnapshot: ((isCheckout?: boolean) => void) | null = null;
let mirrorQueue: eventWithTime[] = [];
/** 지금 묶음에 새로 보는 기기용으로 다시 찍은 화면 전체가 들었는지 */
let queueCheckout = false;
let mirrorTimer: number | undefined;

function flushMirror(): void {
  window.clearTimeout(mirrorTimer);
  mirrorTimer = undefined;
  if (mirrorQueue.length === 0) return;
  const events = JSON.stringify(mirrorQueue).split(window.location.origin).join(ORIGIN_TOKEN);
  const checkout = queueCheckout;
  mirrorQueue = [];
  queueCheckout = false;
  send('devsync:mirror:events', { from: id, name, events, checkout });
}

async function startRecord(): Promise<void> {
  if (stopRecord || recordLoading) return;
  recordLoading = true;
  try {
    // 녹화 도구는 누가 볼 때 처음 불러옴 (안 볼 때는 태블릿에 부담 없음)
    const { record } = await import('rrweb');
    if (!wantRecord || stopRecord) return;
    stopRecord =
      record({
        emit(event, isCheckout) {
          // 다시 찍은 화면 전체는 앞 조각과 섞이지 않게 따로 묶음 (보던 기기가 그 묶음의 화면 전체만 건너뛸 수 있게)
          if (isCheckout && !queueCheckout) {
            flushMirror();
            queueCheckout = true;
          }
          mirrorQueue.push(event);
          if (mirrorTimer === undefined) mirrorTimer = window.setTimeout(flushMirror, MIRROR_BATCH_MS);
        },
        blockSelector: '#devsync-root',
        // <script> 는 빼고 찍음 → 보는 쪽(스크립트 막힌 iframe)에 "Blocked script execution" 경고가 안 뜸
        slimDOMOptions: { script: true, comment: true },
        sampling: { mousemove: 100, scroll: 100, input: 'last' },
      }) ?? null;
    takeFullSnapshot = record.takeFullSnapshot;
  } catch (err) {
    console.warn('[devsync] 화면 보내기를 시작하지 못함', err);
  } finally {
    recordLoading = false;
  }
}

function stopRecordNow(): void {
  stopRecord?.();
  stopRecord = null;
  takeFullSnapshot = null;
  window.clearTimeout(mirrorTimer);
  mirrorTimer = undefined;
  mirrorQueue = [];
  queueCheckout = false;
}

function onMirrorControl(msg: MirrorControlMsg): void {
  wantRecord = msg.watchers > 0;
  if (!wantRecord) return stopRecordNow();
  // 이미 녹화 중인데 새로 보는 기기가 생기면 화면 전체를 한 번 더 (녹화를 막 시작하면 저절로 전체부터 보냄)
  if (stopRecord && msg.fresh) takeFullSnapshot?.(true);
  else void startRecord();
}

/** 보는 쪽이 받는 것: rrweb 이벤트 + 새로 보는 기기용으로 다시 찍은 화면 전체인지 */
export type MirrorListener = (events: eventWithTime[], checkout: boolean) => void;

/** 보는 기기: 찍히는 기기 id → 받은 이벤트를 넘길 곳 */
const mirrorListeners = new Map<string, MirrorListener>();

function onMirrorEvents(msg: MirrorEventsMsg): void {
  const listener = mirrorListeners.get(msg.from);
  if (!listener) return;
  try {
    listener(JSON.parse(msg.events.split(ORIGIN_TOKEN).join(window.location.origin)) as eventWithTime[], !!msg.checkout);
  } catch {
    // 깨진 묶음은 버림 (다음 전체 화면에서 다시 맞춰짐)
  }
}

function watchScreen(target: string, onEvents: MirrorListener): () => void {
  mirrorListeners.set(target, onEvents);
  const ping = () => send('devsync:mirror:watch', { from: id, name, target, on: true });
  ping();
  const timer = window.setInterval(ping, HEARTBEAT_MS);
  return () => {
    window.clearInterval(timer);
    if (mirrorListeners.get(target) === onEvents) mirrorListeners.delete(target);
    send('devsync:mirror:watch', { from: id, name, target, on: false });
  };
}

// ───────── 시작 ─────────

function createLayer(): { host: HTMLElement; taps: HTMLElement; panel: HTMLElement } {
  const host = document.createElement('div');
  host.id = 'devsync-root';
  // 그림자 DOM: 앱 CSS(button, :focus-visible 등)와 패널 CSS 가 서로 섞이지 않게
  host.style.cssText = 'all:initial;position:fixed;left:0;top:0;width:0;height:0;z-index:2147483000;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `${css}\n${rrwebCss}`;
  const taps = document.createElement('div');
  taps.className = 'ds-taps';
  const panel = document.createElement('div');
  panel.className = 'ds-mount';
  shadow.append(style, taps, panel);
  document.body.append(host);
  return { host, taps, panel };
}

export function startDevSync(): void {
  if (started || !import.meta.hot) return;
  started = true;
  hot = import.meta.hot;
  const h = hot;

  hookConsole();
  hookErrors();
  const { host, taps, panel } = createLayer();

  // 연결 상태
  h.on('vite:ws:disconnect', () => {
    connected = false;
    update({ connected: false });
  });
  h.on('vite:ws:connect', () => {
    connected = true;
    update({ connected: true });
    send('devsync:hello', deviceInfo());
    askState();
  });

  // 서버 → 이 기기
  h.on('devsync:info', (info) => update({ info }));
  h.on('devsync:history', ({ entries }) => {
    const items = (entries ?? []).map((e) => ({ ...e, key: ++entryKey, self: e.from === id }));
    update({
      logs: items.filter((e) => e.kind === 'error' || e.kind === 'warn').slice(-ENTRY_MAX),
      events: items.filter((e) => e.kind !== 'error' && e.kind !== 'warn').slice(-ENTRY_MAX),
    });
  });
  let firstList = true;
  h.on('devsync:devices', ({ devices }) => {
    const list = devices ?? [];
    if (!firstList) {
      const before = new Set(snap.devices.map((d) => d.id));
      const after = new Set(list.map((d) => d.id));
      const t = Date.now();
      list
        .filter((d) => !before.has(d.id) && d.id !== id)
        .forEach((d) => addEntry({ kind: 'system', from: d.id, name: d.name, message: '연결됨', route: d.route, t }, false));
      snap.devices
        .filter((d) => !after.has(d.id) && d.id !== id)
        .forEach((d) => addEntry({ kind: 'system', from: d.id, name: d.name, message: '나감', route: d.route, t }, false));
    }
    firstList = false;
    update({ devices: list, devicesAt: Date.now() });
  });
  h.on('devsync:nav', (msg) => {
    if (msg.from !== id && snap.self.follow) applyRoute(msg.route);
  });
  h.on('devsync:state', onRemoteState);
  h.on('devsync:tap', (msg) => {
    if (msg.from !== id) drawTap(taps, msg);
  });
  h.on('devsync:command', (msg) => {
    if (msg.from === id || !(msg.command in COMMAND_LABEL)) return;
    addEntry({ kind: 'command', from: msg.from, name: msg.name, message: COMMAND_LABEL[msg.command], route: '', t: Date.now() }, false);
    runCommand(msg.command);
  });
  // 로그·이벤트: 내 것은 이미 넣었으므로 서버가 돌려준 것은 무시
  h.on('devsync:log', (entry) => {
    if (entry.from !== id) addEntry(entry, false);
  });
  h.on('devsync:event', (entry) => {
    if (entry.from !== id) addEntry(entry, false);
  });
  h.on('devsync:mirror:control', onMirrorControl);
  h.on('devsync:mirror:events', onMirrorEvents);

  // 이 기기 → 서버
  window.addEventListener('hashchange', onHashChange);
  subscribeStore(onStoreChange);
  window.addEventListener('devsync:event', (e: Event) => {
    const detail: unknown = (e as CustomEvent<unknown>).detail;
    emit('event', truncate(typeof detail === 'string' ? detail : formatArg(detail), 500));
  });
  document.addEventListener(
    'pointerdown',
    (e: PointerEvent) => {
      // 캡처 단계: 앱이 stopPropagation 해도 잡힘. 패널 안을 누른 것은 보내지 않음
      if (e.composedPath().includes(host)) return;
      const r = frameRect();
      if (r.width <= 0 || r.height <= 0) return;
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      send('devsync:tap', { from: id, name, x, y, route: currentRoute() });
    },
    { capture: true, passive: true },
  );

  // 기기 목록: 바로 인사 + 5초마다 신호. 크기가 바뀌거나 화면이 다시 보이면 바로 신호
  send('devsync:hello', deviceInfo());
  askState();
  window.setInterval(heartbeat, HEARTBEAT_MS);
  let resizeTimer: number | undefined;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(heartbeat, 300);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') heartbeat();
  });

  const api: DevSyncApi = {
    subscribe(cb) {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    getSnapshot: () => snap,
    setFollow(on) {
      writeSession(FOLLOW_KEY, on ? '1' : '0');
      update({ self: { ...snap.self, follow: on } });
      heartbeat();
      askState();
    },
    sendCommand,
    goTo: applyRoute,
    clearEntries: () => update({ logs: [], events: [] }),
    watchScreen,
  };
  mountDebugPanel(panel, api);
}
