// 태블릿↔PC 실시간 동기화 — Vite 플러그인 (개발 서버 전용, CLAUDE.md 5장)
// Vite HMR 웹소켓의 사용자 이벤트(devsync:*)를 그대로 써서 추가 서버·포트가 없습니다.
// apply: 'serve' 라서 납품 빌드(vite build)에는 끼어들지 않습니다.
import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import * as QRCode from 'qrcode';
import type { Plugin, ViteDevServer, WebSocketClient } from 'vite';
// 타입만 가져옴 (실행 때는 지워짐). 확장자를 붙여 두면 Vite 의 native 설정 로더 경고가 하나 줄어듦
import type {
  CommandMsg,
  CommandName,
  DeviceInfo,
  DeviceRow,
  HistoryEntry,
  MirrorEventsMsg,
  MirrorWatchMsg,
  NavMsg,
  ServerInfo,
  StateMsg,
  TapMsg,
} from '../src/renderer/src/devsync/protocol.ts';
import { PROJECT_ROOT } from './hospital-pack.mjs';

const HEARTBEAT_TIMEOUT_MS = 12_000;
/** 화면 보기: 보는 기기가 5초마다 다시 알림 → 12초 소식이 없으면 그만 본 것으로 */
const MIRROR_LEASE_MS = 12_000;
const SWEEP_MS = 2_000;
const HISTORY_MAX = 100;
const MAX_LEN = 2_000;
/** 클라이언트도 초당 20개로 막지만, 서버도 한 번 더 막음 */
const SERVER_LOGS_PER_SEC = 40;

// 색은 의존성 없이 ANSI 코드로
const c = {
  red: (s: string) => `\x1b[31m${s}\x1b[39m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[39m`,
  green: (s: string) => `\x1b[32m${s}\x1b[39m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[39m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[39m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[39m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
};

interface DeviceEntry {
  info: DeviceInfo;
  lastSeen: number;
  client: WebSocketClient | null;
}

/** 기기가 보낸 글자를 터미널에 찍기 전에 정리 (색·커서 제어 문자 제거 + 길이 제한) */
function clean(value: unknown, max = MAX_LEN): string {
  const s = typeof value === 'string' ? value : String(value ?? '');
  const stripped = s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
  return stripped.length > max ? `${stripped.slice(0, max)}…(잘림)` : stripped;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toDeviceInfo(data: Partial<DeviceInfo> | undefined): DeviceInfo | null {
  if (!data || typeof data.id !== 'string' || !data.id) return null;
  const kind = data.kind === 'tablet' || data.kind === 'phone' ? data.kind : 'pc';
  return {
    id: clean(data.id, 64),
    name: clean(data.name, 40) || '기기',
    kind,
    vw: num(data.vw),
    vh: num(data.vh),
    route: clean(data.route, 200) || '#/',
    follow: data.follow !== false,
    ua: clean(data.ua, 400),
  };
}

function time(t = Date.now()): string {
  return new Date(t).toTimeString().slice(0, 8);
}

/** 가상 어댑터(WSL·VirtualBox 등) 주소는 뒤로 → 첫 주소가 진짜 와이파이일 확률을 높임 */
function rankUrl(url: string, ifName: string | undefined): number {
  const virtual = /vEthernet|VirtualBox|VMware|Hyper-V|WSL|Loopback|docker|Tailscale|ZeroTier|Bluetooth/i;
  let rank = 3;
  if (/\/\/192\.168\.(?!56\.)/.test(url)) rank = 0;
  else if (/\/\/10\./.test(url)) rank = 1;
  else if (/\/\/172\.(1[6-9]|2\d|3[01])\./.test(url)) rank = 2;
  if (ifName && virtual.test(ifName)) rank += 10;
  return rank;
}

/** 주소의 IP 가 어느 네트워크(와이파이·이더넷·가상 어댑터) 것인지. Vite 7 은 이름을 같이 주지 않아서 직접 찾음 */
function interfaceOf(url: string): string | undefined {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  for (const [ifName, addrs] of Object.entries(networkInterfaces())) {
    if (addrs?.some((a) => a.address === host)) return ifName;
  }
  return undefined;
}

/** resolvedUrls 가 비었을 때 (host 설정이 특이할 때) 직접 IPv4 주소를 찾음 */
function fallbackNetworkUrls(port: number): { url: string; ifName: string }[] {
  const out: { url: string; ifName: string }[] = [];
  for (const [ifName, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ url: `http://${a.address}:${port}/`, ifName });
    }
  }
  return out;
}

/**
 * DEV 패널 "제작 방향서"가 여는 폴더 (_mockups/ PDF·시안, presentation/ 발표 슬라이드)를 프로젝트 맨 위(app/ 바깥)에서 그대로 내려줌.
 * 화면 루트가 src/renderer 라서 Vite 가 저절로 내려주지 않음. 개발 서버에만 있어서 납품 빌드·앱에는 안 들어감.
 */
const PROJECT_FOLDERS = ['_mockups', 'presentation'];
const FILE_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function projectFolders(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  let path: string;
  try {
    path = decodeURIComponent((req.url ?? '').split('?')[0]);
  } catch {
    return next();
  }
  const folder = PROJECT_FOLDERS.find((f) => path === `/${f}` || path.startsWith(`/${f}/`));
  if (!folder) return next();
  // /presentation → /presentation/ (슬라이드 안의 img/ 상대 주소가 맞게)
  if (path === `/${folder}`) {
    res.writeHead(302, { Location: `/${folder}/` });
    res.end();
    return;
  }
  const base = join(PROJECT_ROOT, folder);
  let file = resolve(PROJECT_ROOT, `.${path}`);
  if (file !== base && !file.startsWith(base + sep)) return next();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file) || !statSync(file).isFile()) return next();
  res.setHeader('Content-Type', FILE_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache');
  createReadStream(file).pipe(res);
}

export function devSync(): Plugin {
  return {
    name: 'devsync',
    apply: 'serve',
    configureServer(server) {
      // 함수를 돌려주지 않고 바로 등록 → Vite 내부 미들웨어보다 먼저 실행됨
      server.middlewares.use(projectFolders);
      setup(server);
    },
  };
}

function setup(server: ViteDevServer) {
  const logger = server.config.logger;
  const print = (line: string) => logger.info(`${c.gray(time())} ${c.magenta('[devsync]')} ${line}`);

  const devices = new Map<string, DeviceEntry>();
  const clientIds = new WeakMap<WebSocketClient, string>();
  /** 새로고침이면 "나감/들어옴" 두 줄 대신 한 줄만 찍으려고 잠깐 미룸 */
  const pendingLeave = new Map<string, ReturnType<typeof setTimeout>>();
  const history: HistoryEntry[] = [];
  const logRate = new Map<string, { start: number; count: number }>();
  /** 화면 보기: 찍히는 기기 id → (보는 기기 id → 마지막 알림 시각) */
  const watchers = new Map<string, Map<string, number>>();
  let info: ServerInfo = { local: [], network: [], qr: [] };

  const label = (id: string, fallback = '기기') => {
    const d = devices.get(id);
    return d ? `${d.info.name} ${c.gray(id.slice(0, 4))}` : `${fallback} ${c.gray(id.slice(0, 4))}`;
  };

  function deviceRows(): DeviceRow[] {
    const now = Date.now();
    return [...devices.values()].map((d) => ({ ...d.info, ageMs: now - d.lastSeen }));
  }

  function broadcastDevices() {
    server.ws.send('devsync:devices', { devices: deviceRows() });
  }

  function pushHistory(entry: HistoryEntry) {
    history.push(entry);
    if (history.length > HISTORY_MAX) history.shift();
  }

  /** hello·heartbeat 공통: 기기 등록/갱신. 잘못된 데이터면 null */
  function upsert(data: Partial<DeviceInfo> | undefined, client: WebSocketClient, hello: boolean): DeviceInfo | null {
    const next = toDeviceInfo(data);
    if (!next) return null;
    const prev = devices.get(next.id);
    devices.set(next.id, { info: next, lastSeen: Date.now(), client });
    clientIds.set(client, next.id);
    if (!prev) {
      const leaveTimer = pendingLeave.get(next.id);
      if (leaveTimer) {
        clearTimeout(leaveTimer);
        pendingLeave.delete(next.id);
        print(c.gray(`↻ ${next.name} 새로고침 (${next.route})`));
      } else {
        print(c.green(`+ ${next.name} 연결 ${c.gray(`${next.id.slice(0, 4)} · ${next.vw}×${next.vh} · ${next.route}`)}`));
      }
    }
    // 새 연결(새로고침 포함)에게: 접속 주소·QR, 지금까지의 기록
    if (hello || !prev || prev.client !== client) {
      client.send('devsync:info', info);
      client.send('devsync:history', { entries: history });
      // 새로 열린 화면은 아직 아무것도 안 보는 중 → 남아 있던 "보는 중" 표시를 지움
      // (새로고침 때 hello 가 옛 연결 끊김보다 먼저 오면 remove 가 안 불려 남음 → 다음 "화면 보기"가 새 화면 전체를 못 받았음)
      if (!prev || prev.client !== client) for (const targetId of [...watchers.keys()]) unwatch(next.id, targetId);
      // 찍히는 기기에게 지금 보는 수를 늘 알려 줌: 0이면 혹시 남은 녹화를 멈춤 (목록에서 빠진 사이에 놓친 "그만"),
      // 보는 중이면 화면 전체부터 다시 (보는 중에 새로고침)
      const viewers = watchers.get(next.id)?.size ?? 0;
      client.send('devsync:mirror:control', { watchers: viewers, fresh: viewers > 0 });
    }
    return next;
  }

  /** 찍히는 기기에게 지금 보는 기기 수를 알림 */
  function sendControl(targetId: string, fresh: boolean) {
    devices.get(targetId)?.client?.send('devsync:mirror:control', { watchers: watchers.get(targetId)?.size ?? 0, fresh });
  }

  function unwatch(viewerId: string, targetId: string) {
    const set = watchers.get(targetId);
    if (!set?.delete(viewerId)) return;
    if (set.size === 0) watchers.delete(targetId);
    print(c.gray(`▢ ${label(viewerId)} → ${label(targetId)} 화면 보기 끝`));
    sendControl(targetId, false);
  }

  function remove(id: string, reason: 'disconnect' | 'timeout') {
    const d = devices.get(id);
    if (!d) return;
    // 나간 기기가 보던 화면은 그만 봄 (찍히던 기기 쪽 목록은 새로고침하고 돌아올 수 있으니 둠 — 12초 뒤 저절로 정리)
    for (const targetId of [...watchers.keys()]) unwatch(id, targetId);
    devices.delete(id);
    broadcastDevices();
    if (reason === 'timeout') {
      print(c.gray(`- ${d.info.name} 응답 없음 (12초) → 목록에서 뺌`));
      return;
    }
    pendingLeave.set(
      id,
      setTimeout(() => {
        pendingLeave.delete(id);
        print(c.gray(`- ${d.info.name} 연결 끊김`));
      }, 1500),
    );
  }

  // ---- 기기 목록 ----
  server.ws.on('devsync:hello', (data: Partial<DeviceInfo> | undefined, client: WebSocketClient) => {
    if (upsert(data, client, true)) broadcastDevices();
  });
  server.ws.on('devsync:heartbeat', (data: Partial<DeviceInfo> | undefined, client: WebSocketClient) => {
    // 서버를 다시 켠 직후엔 hello 없이 heartbeat 부터 올 수 있음 → upsert 가 등록까지 처리
    if (upsert(data, client, false)) broadcastDevices();
  });
  server.ws.on('vite:client:disconnect', (_data: unknown, client: WebSocketClient) => {
    const id = clientIds.get(client);
    // 새로고침 때는 새 연결이 먼저 hello 할 수 있음 → 같은 연결일 때만 지움
    if (id && devices.get(id)?.client === client) remove(id, 'disconnect');
  });

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [id, d] of devices) {
      if (now - d.lastSeen > HEARTBEAT_TIMEOUT_MS) remove(id, 'timeout');
    }
    for (const [targetId, set] of [...watchers]) {
      for (const [viewerId, seen] of [...set]) if (now - seen > MIRROR_LEASE_MS) unwatch(viewerId, targetId);
    }
  }, SWEEP_MS);
  sweep.unref();
  // 설정 파일이 바뀌면 서버가 다시 만들어지고 configureServer 가 또 불림 → 이전 타이머 정리
  server.httpServer?.once('close', () => {
    clearInterval(sweep);
    pendingLeave.forEach((t) => clearTimeout(t));
  });

  // ---- 그대로 전달 (보낸 기기는 자기 id 를 보고 무시) ----
  server.ws.on('devsync:nav', (data: NavMsg | undefined) => {
    if (!data || typeof data.from !== 'string') return;
    print(c.gray(`${label(data.from, clean(data.name, 40))} → ${clean(data.route, 200)}`));
    server.ws.send('devsync:nav', data);
  });
  server.ws.on('devsync:state', (data: StateMsg | undefined) => {
    if (!data || typeof data.from !== 'string') return;
    server.ws.send('devsync:state', data);
  });
  server.ws.on('devsync:tap', (data: TapMsg | undefined) => {
    if (!data || typeof data.from !== 'string') return;
    server.ws.send('devsync:tap', data);
  });
  server.ws.on('devsync:command', (data: CommandMsg | undefined) => {
    if (!data || typeof data.from !== 'string') return;
    const names: Record<CommandName, string> = { reload: '모든 기기 새로고침', home: '모든 기기 처음으로', reset: '진행 초기화' };
    if (!(data.command in names)) return;
    print(c.magenta(`★ ${clean(data.name, 40)}: ${names[data.command]}`));
    server.ws.send('devsync:command', data);
  });

  // ---- 화면 그대로 보기 (rrweb): 화면 데이터는 크므로 보는 기기에게만 골라서 보냄 ----
  server.ws.on('devsync:mirror:watch', (data: MirrorWatchMsg | undefined) => {
    if (!data || typeof data.from !== 'string' || typeof data.target !== 'string' || data.from === data.target) return;
    if (!data.on) {
      unwatch(data.from, data.target);
      return;
    }
    let set = watchers.get(data.target);
    if (!set) watchers.set(data.target, (set = new Map()));
    const fresh = !set.has(data.from);
    set.set(data.from, Date.now());
    if (!fresh) return;
    print(c.cyan(`▣ ${label(data.from, clean(data.name, 40))} → ${label(data.target)} 화면 보기`));
    sendControl(data.target, true);
  });
  server.ws.on('devsync:mirror:events', (data: MirrorEventsMsg | undefined) => {
    if (!data || typeof data.from !== 'string' || typeof data.events !== 'string') return;
    const set = watchers.get(data.from);
    if (!set) return;
    for (const viewerId of set.keys()) devices.get(viewerId)?.client?.send('devsync:mirror:events', data);
  });

  // ---- 로그·이벤트: 터미널에 찍고, 기록에 넣고, 패널로 전달 ----
  /** 기기별 초당 개수 제한 (로그와 이벤트는 따로 셈 → 로그가 쏟아져도 진행 이벤트는 보임) */
  function allowLog(from: string): boolean {
    const now = Date.now();
    const r = logRate.get(from);
    if (!r || now - r.start >= 1000) {
      logRate.set(from, { start: now, count: 1 });
      return true;
    }
    r.count += 1;
    return r.count <= SERVER_LOGS_PER_SEC;
  }

  server.ws.on('devsync:log', (data: HistoryEntry | undefined) => {
    if (!data || typeof data.from !== 'string' || !allowLog(data.from)) return;
    const level = data.kind === 'warn' ? 'warn' : 'error';
    const entry: HistoryEntry = {
      kind: level,
      from: data.from,
      name: clean(data.name, 40),
      message: clean(data.message),
      route: clean(data.route, 200),
      t: Date.now(),
    };
    pushHistory(entry);
    const tag = level === 'error' ? c.red(c.bold('ERROR')) : c.yellow(c.bold('WARN '));
    const paint = level === 'error' ? c.red : c.yellow;
    // 여러 줄(스택)은 들여 써서 어느 기기 것인지 헷갈리지 않게
    const [first = '', ...rest] = entry.message.split('\n');
    print(`${tag} ${label(entry.from, entry.name)} ${c.gray(entry.route)} ${paint(first)}`);
    rest.slice(0, 12).forEach((line) => logger.info(`           ${c.gray(line)}`));
    if (rest.length > 12) logger.info(c.gray(`           …${rest.length - 12}줄 더`));
    server.ws.send('devsync:log', entry);
  });

  server.ws.on('devsync:event', (data: HistoryEntry | undefined) => {
    if (!data || typeof data.from !== 'string' || !allowLog(`${data.from}:event`)) return;
    const entry: HistoryEntry = {
      kind: 'event',
      from: data.from,
      name: clean(data.name, 40),
      message: clean(data.message, 500),
      route: clean(data.route, 200),
      t: Date.now(),
    };
    pushHistory(entry);
    print(`${c.cyan('●')} ${label(entry.from, entry.name)} ${c.cyan(entry.message)}`);
    server.ws.send('devsync:event', entry);
  });

  // ---- 접속 주소 + QR ----
  async function buildInfo() {
    const urls = server.resolvedUrls;
    let network = (urls?.network ?? []).map((url) => ({ url, ifName: interfaceOf(url) }));
    if (network.length === 0) {
      const addr = server.httpServer?.address();
      const port = addr && typeof addr === 'object' ? addr.port : server.config.server.port;
      // host: true 가 아니면 다른 기기에서 접속이 안 되므로 안내만
      if (server.config.server.host) network = fallbackNetworkUrls(port ?? 5173);
    }
    network.sort((a, b) => rankUrl(a.url, a.ifName) - rankUrl(b.url, b.ifName));
    const qrUrls = network.slice(0, 4).map((n) => n.url);
    const qr = await Promise.all(
      qrUrls.map(async (url) => ({ url, svg: await QRCode.toString(url, { type: 'svg', margin: 1 }) })),
    );
    info = { local: urls?.local ?? [], network: network.map((n) => n.url), qr };
    server.ws.send('devsync:info', info);

    if (network.length === 0) {
      print(c.yellow('LAN 주소를 찾지 못했어요. 와이파이 연결과 tools/renderer-config.ts 의 server.host 를 확인하세요.'));
      return;
    }
    const main = network[0].url;
    const art = await QRCode.toString(main, { type: 'terminal', small: true });
    logger.info('');
    print(`${c.bold('태블릿 연결')} — 같은 와이파이에서 QR을 찍거나 주소를 입력하세요`);
    logger.info(`  ${c.green('➜')}  ${c.bold(c.cyan(main))}`);
    network.slice(1).forEach((n) => logger.info(c.gray(`     (다른 주소) ${n.url}${n.ifName ? `  ${n.ifName}` : ''}`)));
    logger.info(art.replace(/^/gm, '  '));
    logger.info(c.gray('  안 열리면: Windows 방화벽 창에서 Node.js "개인 네트워크" 허용'));
    logger.info('');
  }

  // resolvedUrls 는 listening 직후가 아니라 조금 뒤에 채워짐 → 짧게 여러 번 확인 (최대 5초)
  server.httpServer?.once('listening', () => {
    let tries = 0;
    const wait = setInterval(() => {
      tries += 1;
      if ((server.resolvedUrls?.network.length ?? 0) > 0 || tries >= 50) {
        clearInterval(wait);
        // Vite 자체 주소 안내가 먼저 찍히도록 한 박자 늦게
        setTimeout(() => {
          buildInfo().catch((err: unknown) => print(c.red(`QR 만들기 실패: ${String(err)}`)));
        }, 150);
      }
    }, 100);
    wait.unref();
  });
}
