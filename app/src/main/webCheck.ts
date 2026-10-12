// 내보낸 zip 확인 (CLAUDE.md 1-c ⑤단계 더함, 2026-10-09): 웹으로 내보낸 zip 을 다시 읽어 점검하고,
// 앱이 잠깐 웹서버가 되어 서버의 하위 폴더(/web-check/)에 푼 것처럼 보여 줌 → 기본 브라우저로 열어 확인.
// 서버는 이 PC 안(127.0.0.1)에서만 열림, 한 번에 하나, 앱을 끄면 꺼짐. zip 은 풀지 않고 메모리에서 바로 줌.
// Electron 을 부르지 않음 → 자동 점검에서 바로 시험 (tests/export.spec.ts)
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname } from 'node:path';
import { PROJECT_FORMAT } from './project';
import type { ZipEntry } from './zip';

/** 브라우저에서 여는 하위 폴더 (병원 서버의 아무 폴더에 푼 것처럼 — 상대 경로가 맞는지 같이 봄) */
export const CHECK_FOLDER = 'web-check';

export interface CheckItem {
  /** ok = 통과, warn = 열리지만 알아 둘 것, fail = 고쳐야 함 */
  level: 'ok' | 'warn' | 'fail';
  label: string;
  detail?: string;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ico': 'image/x-icon',
};

const isHidden = (path: string) => path.split('/').some((p) => p.startsWith('_') || p.startsWith('.'));

interface Exam {
  id?: string;
  cover?: { image?: string };
  phases?: { sticker?: string; illustration?: string }[];
  steps?: {
    image?: string;
    audio?: string;
    sensory?: { sound?: { file?: string } }[];
    practice?: { feel?: { sound?: { file?: string } }; choices?: { image?: string }[] };
  }[];
}

/** 원고가 쓰는 사진·소리 경로 (content/ 기준). 효과음 이름(synth)은 빼고 파일 이름만 */
function referencedMedia(exams: Exam[], listed: string[]): string[] {
  const out = new Set<string>();
  const add = (p?: string) => p && out.add(p);
  for (const id of listed) add(`covers/${id}.jpg`);
  for (const e of exams) {
    if (!listed.includes(e.id ?? '')) continue;
    add(e.cover?.image);
    for (const ph of e.phases ?? []) {
      add(ph.sticker);
      add(ph.illustration);
    }
    for (const s of e.steps ?? []) {
      add(s.image);
      add(s.audio);
      for (const c of s.sensory ?? []) add(c.sound?.file);
      add(s.practice?.feel?.sound?.file);
      for (const c of s.practice?.choices ?? []) add(c.image);
    }
  }
  return [...out];
}

const sample = (list: string[], n = 3) => list.slice(0, n).join(', ') + (list.length > n ? ` 외 ${list.length - n}개` : '');

/** 내보낸 zip 점검 (서버의 아무 폴더에 풀어서 열릴지) */
export function checkWebZip(entries: ZipEntry[]): CheckItem[] {
  const items: CheckItem[] = [];
  const files = new Map(entries.map((e) => [e.path, e.data]));

  // 1. 맨 위에 index.html (폴더째 한 번 더 감싸서 압축하면 서버에 풀었을 때 주소가 한 겹 깊어짐)
  const index = files.get('index.html');
  if (index) items.push({ level: 'ok', label: '맨 위에 index.html' });
  else {
    const nested = entries.find((e) => /^[^/]+\/index\.html$/.test(e.path))?.path;
    items.push({
      level: 'fail',
      label: '맨 위에 index.html 이 없어요',
      detail: nested ? `"${nested.split('/')[0]}" 폴더 안에 있어요. 폴더째 감싸지 말고 안의 파일들을 압축해 주세요` : '웹으로 내보내기로 만든 zip 인지 확인해 주세요',
    });
  }

  // 2. 상대 경로 (/ 로 시작하는 주소면 서버의 하위 폴더에 풀었을 때 그림·스크립트를 못 찾음)
  if (index) {
    const abs = index.toString('utf8').match(/(src|href)="\/[^"]*"/g) ?? [];
    items.push(abs.length ? { level: 'fail', label: '주소가 / 로 시작해요', detail: sample(abs) } : { level: 'ok', label: '주소가 모두 상대 경로' });
  }

  // 3. 원고 (content/project.json)
  const raw = files.get('content/project.json');
  let data: { format?: number; hospital?: { name?: string; exams?: string[] }; exams?: Exam[]; media?: { files?: string[]; temp?: string[] } } | null = null;
  if (!raw) items.push({ level: 'fail', label: '원고(content/project.json)가 없어요' });
  else {
    try {
      data = JSON.parse(raw.toString('utf8'));
    } catch {
      items.push({ level: 'fail', label: '원고(content/project.json)를 읽지 못했어요' });
    }
  }
  if (data) {
    const listed = Array.isArray(data.hospital?.exams) ? data.hospital!.exams! : [];
    const exams = Array.isArray(data.exams) ? data.exams : [];
    const ids = new Set(exams.map((e) => e.id));
    const noScript = listed.filter((id) => !ids.has(id));
    if ((data.format ?? 0) > PROJECT_FORMAT) items.push({ level: 'fail', label: `더 새 형식의 원고예요 (형식 ${data.format})` });
    if (listed.length === 0) items.push({ level: 'fail', label: '보여 줄 검사가 없어요' });
    else if (noScript.length) items.push({ level: 'fail', label: '원고가 없는 검사가 있어요', detail: noScript.join(', ') });
    else items.push({ level: 'ok', label: `원고: ${data.hospital?.name ?? '?'} · 검사 ${listed.length}개` });

    // 4. 사진·소리 목록에 있는 파일이 zip 안에 다 있는지 (없으면 그 자리가 깨진 그림)
    const mediaFiles = Array.isArray(data.media?.files) ? data.media!.files! : [];
    const lost = mediaFiles.filter((f) => !files.has(`content/${f}`));
    items.push(lost.length ? { level: 'fail', label: `zip 에 없는 사진·소리 ${lost.length}개`, detail: sample(lost) } : { level: 'ok', label: `사진·소리 파일 ${mediaFiles.length}개 모두 들어 있음` });

    // 5. 원고가 쓰는데 아직 없는 것 (웹에서도 "사진 준비 중"·기계 목소리) · 임시 사진
    const have = new Set(mediaFiles);
    const missing = referencedMedia(exams, listed).filter((p) => !have.has(p));
    if (missing.length) items.push({ level: 'warn', label: `아직 없는 사진·소리 ${missing.length}개`, detail: '"사진 준비 중"이나 기계 목소리로 보여요' });
    const temp = Array.isArray(data.media?.temp) ? data.media!.temp! : [];
    if (temp.length) items.push({ level: 'warn', label: `임시 사진 ${temp.length}개`, detail: '"임시 사진" 표시가 보여요' });
  }

  // 6. 숨김 파일·편집기 코드가 섞이지 않았는지
  const hidden = entries.filter((e) => isHidden(e.path)).map((e) => e.path);
  if (hidden.length) items.push({ level: 'warn', label: `숨김 파일 ${hidden.length}개`, detail: sample(hidden) });
  const editor = entries.filter((e) => /\.(js|css|html)$/.test(e.path) && /ed-toolbar|devsync/.test(e.data.toString('utf8'))).map((e) => e.path);
  items.push(editor.length ? { level: 'fail', label: '편집기 코드가 들어 있어요', detail: sample(editor) } : { level: 'ok', label: '편집기 코드 없음' });
  return items;
}

/** zip 내용을 그대로 주는 잠깐 웹서버 (127.0.0.1, /web-check/ 아래) */
export class WebCheckServer {
  private server: Server | null = null;
  private files = new Map<string, Buffer>();
  url: string | null = null;

  get running(): boolean {
    return !!this.server;
  }

  async start(entries: ZipEntry[]): Promise<string> {
    await this.stop();
    this.files = new Map(entries.map((e) => [e.path, e.data]));
    const server = createServer((req, res) => this.handle(req, res));
    await new Promise<void>((done, fail) => {
      server.once('error', fail);
      server.listen(0, '127.0.0.1', () => done());
    });
    this.server = server;
    this.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/${CHECK_FOLDER}/`;
    return this.url;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.url = null;
    this.files = new Map();
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    }
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    let path: string;
    try {
      path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const base = `/${CHECK_FOLDER}/`;
    if (path === '/' || path === `/${CHECK_FOLDER}`) {
      res.writeHead(302, { Location: base }).end();
      return;
    }
    if (!path.startsWith(base)) {
      res.writeHead(404).end();
      return;
    }
    let rel = path.slice(base.length);
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const data = this.files.get(rel);
    if (!data) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`zip 안에 없어요: ${rel}`);
      return;
    }
    const headers: Record<string, string | number> = {
      'Content-Type': TYPES[extname(rel).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Accept-Ranges': 'bytes',
    };
    // 소리·영상은 부분 요청(Range)으로 받기도 함
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range && (range[1] || range[2])) {
      const size = data.length;
      let start = range[1] ? Number(range[1]) : size - Number(range[2]);
      let end = range[1] && range[2] ? Number(range[2]) : size - 1;
      start = Math.max(0, start);
      end = Math.min(size - 1, end);
      if (start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
        return;
      }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
      res.end(req.method === 'HEAD' ? undefined : data.subarray(start, end + 1));
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': data.length });
    res.end(req.method === 'HEAD' ? undefined : data);
  }
}
