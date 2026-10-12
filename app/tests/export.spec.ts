// 웹으로 내보내기 점검 (CLAUDE.md 1-c ⑤단계): 편집기 "파일 → 웹으로 내보내기"가 만드는 zip
//   새 프로젝트 → 사진 바꾸기 → zip → 직접 풀어 내용 확인 → 웹서버의 하위 경로에 풀어 브라우저로 열기
// 플레이어 틀(out/player)이 있어야 함 → yarn test:e2e 가 먼저 만듦 (yarn build:player)
// 브라우저 화면 크기와 상관없으므로 첫 번째 크기(프로젝트)에서만 한 번 돌림
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { exportWeb } from '../src/main/exportWeb';
import { ProjectSession } from '../src/main/project';
import { checkWebZip, WebCheckServer } from '../src/main/webCheck';
import { readZip as appReadZip } from '../src/main/zip';

const TEMPLATE = join(process.cwd(), '..', 'hospitals', process.env.HOSPITAL || 'SampleHospital');
const COMMON = join(process.cwd(), 'src', 'renderer', 'public', 'content');
const PLAYER = join(process.cwd(), 'out', 'player');

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== info.config.projects[0].name, '브라우저와 상관없는 점검이라 한 번만');
});

let tmp = '';
test.beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'export-test-'));
});
test.afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = '';
});

/** zip 읽기 (시험용, 앱 코드와 따로): 중앙 목록을 따라 파일마다 풀고 CRC 를 확인 */
function readZip(file: string): { path: string; data: Buffer; method: number }[] {
  const buf = readFileSync(file);
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end, 'zip 끝 표시').toBeGreaterThan(0);
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out: { path: string; data: Buffer; method: number }[] = [];
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const path = buf.subarray(p + 46, p + 46 + nlen).toString('utf8');
    expect(buf.readUInt32LE(local)).toBe(0x04034b50);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    const data = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
    expect(data.length, `${path} 크기`).toBe(usize);
    expect(crc32(data), `${path} CRC`).toBe(crc);
    out.push({ path, data, method });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/** 아주 단순한 정적 웹서버 (병원 서버 대신) */
function serve(root: string): Promise<{ server: Server; port: number }> {
  return new Promise((done) => {
    const server = createServer((req, res) => {
      let file = resolve(root, `.${decodeURIComponent((req.url ?? '/').split('?')[0])}`);
      if (file !== root && !file.startsWith(root + sep)) return void res.writeHead(403).end();
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
      if (!existsSync(file)) return void res.writeHead(404).end();
      res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' });
      res.end(readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => done({ server, port: (server.address() as AddressInfo).port }));
  });
}

test('웹으로 내보내기: zip 하나(맨 위 index.html·assets·content), 바꾼 사진·원고 그대로, 편집기 코드·숨김 파일 없음 → 하위 경로에 풀어 열림', async ({ page }) => {
  expect(existsSync(join(PLAYER, 'index.html')), '플레이어 틀이 없어요: yarn build:player').toBe(true);

  const session = new ProjectSession({ workRoot: join(tmp, 'work'), templateDir: TEMPLATE, commonDir: COMMON, appVersion: 'test' });
  await session.newProject();
  const before = await session.projectData();
  const exam = before.exams.find((e) => (e as { id: string }).id === before.hospital.exams[0]) as { id: string; cover: { image: string } };
  const cover = exam.cover.image;
  // 바꿀 사진: 400×300 진짜 jpg (편집기에서 사진을 바꾼 것과 같음)
  const photo = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#3a8a5c' } }).jpeg().toBuffer();
  await session.apply([{ kind: 'put', path: cover, bytes: photo }], '사진 바꾸기');

  const zipFile = join(tmp, '병원 결과.zip');
  const res = await exportWeb(session, PLAYER, zipFile);
  expect(existsSync(`${zipFile}.tmp`)).toBe(false);
  expect(res.bytes).toBe(statSync(zipFile).size);

  const entries = readZip(zipFile);
  expect(entries.length).toBe(res.count);
  const byPath = new Map(entries.map((e) => [e.path, e]));
  // 맨 위에 index.html (폴더 한 겹 없이), 모든 경로는 상대 경로
  expect(entries[0].path).toBe('index.html');
  expect(entries.every((e) => !e.path.startsWith('/') && !e.path.includes('\\') && !e.path.split('/').includes('..'))).toBe(true);
  expect(entries.every((e) => /^(index\.html|assets\/|content\/)/.test(e.path)), '맨 위는 index.html·assets·content 만').toBe(true);
  expect(entries.some((e) => e.path.split('/').some((p) => p.startsWith('_') || p.startsWith('.'))), '숨김 파일(_temp.json 등) 없음').toBe(false);
  // 사진은 압축하지 않고 그대로, 글자 파일은 압축
  expect(byPath.get(`content/${cover}`)?.data.equals(photo)).toBe(true);
  expect(byPath.get(`content/${cover}`)?.method).toBe(0);
  expect(byPath.get('index.html')?.method).toBe(8);
  // 원고: 지금 프로젝트 그대로, 바꾼 사진은 "임시"가 아님
  const data = JSON.parse(byPath.get('content/project.json')!.data.toString('utf8'));
  expect(data.hospital.id).toBe(before.hospital.id);
  expect(data.exams.length).toBe(before.exams.length);
  expect(data.media.temp).not.toContain(cover);
  // 사진·소리 목록에 있는 파일은 모두 zip 안에
  for (const f of data.media.files as string[]) expect(byPath.has(`content/${f}`), f).toBe(true);
  // 편집기 코드 없음 (편집기 화면 글자·스타일 이름)
  for (const e of entries.filter((x) => /\.(js|css|html)$/.test(x.path))) {
    const text = e.data.toString('utf8');
    for (const word of ['ed-toolbar', '웹으로 내보내기', '사진 바꾸기', 'devsync']) expect(text.includes(word), `${e.path} 에 "${word}"`).toBe(false);
  }
  // 상대 경로: index.html 이 / 로 시작하는 주소를 쓰지 않음
  expect(byPath.get('index.html')!.data.toString('utf8')).not.toMatch(/(src|href)="\//);

  // 서버의 하위 경로(/hospital/social-story/)에 풀어서 열기
  const site = join(tmp, 'site');
  const base = join(site, 'hospital', 'social-story');
  for (const e of entries) {
    const target = join(base, ...e.path.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, e.data);
  }
  const { server, port } = await serve(site);
  try {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('response', (r) => {
      if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
    });
    const url = `http://127.0.0.1:${port}/hospital/social-story/`;
    await page.goto(`${url}#/${exam.id}/0`);
    await expect(page.locator('[data-app-frame]')).toBeVisible();
    const img = page.locator(`img[src$="content/${cover}"]`).first();
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(400);
    expect(await page.getByText('임시 사진').count()).toBe(0);
    // 첫 화면도 열림 (검사 카드)
    await page.goto(url);
    await expect(page.locator('[data-app-frame]')).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  } finally {
    server.close();
  }
});

test('내보낸 zip 확인: 앱 zip 읽기·점검이 통과하고, 잠깐 웹서버(/web-check/)로 열림. 폴더째 감싼 zip 은 "맨 위 index.html 없음"', async ({ page }) => {
  const session = new ProjectSession({ workRoot: join(tmp, 'work'), templateDir: TEMPLATE, commonDir: COMMON, appVersion: 'test' });
  await session.newProject();
  const zipFile = join(tmp, 'web.zip');
  await exportWeb(session, PLAYER, zipFile);

  const entries = await appReadZip(zipFile);
  expect(entries.map((e) => e.path)).toEqual(readZip(zipFile).map((e) => e.path));
  const items = checkWebZip(entries);
  expect(items.filter((i) => i.level === 'fail'), JSON.stringify(items)).toEqual([]);
  expect(items.some((i) => i.label.startsWith('원고:'))).toBe(true);
  // 기본 틀은 임시 사진·없는 사진이 있음 → 알림(warn)
  expect(items.some((i) => i.level === 'warn' && i.label.startsWith('임시 사진'))).toBe(true);

  const server = new WebCheckServer();
  const url = await server.start(entries);
  try {
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/web-check\/$/);
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
    await page.goto(url);
    await expect(page.locator('[data-app-frame]')).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
    // 부분 요청(소리·영상)
    const someImage = entries.find((e) => e.path.endsWith('.png'))!;
    const part = await page.request.get(`${url}${someImage.path}`, { headers: { Range: 'bytes=0-9' } });
    expect(part.status()).toBe(206);
    expect((await part.body()).length).toBe(10);
  } finally {
    await server.stop();
  }
  expect(server.running).toBe(false);

  // 폴더째 한 번 더 감싸서 압축한 zip
  const nested = checkWebZip(entries.map((e) => ({ ...e, path: `site/${e.path}` })));
  const top = nested.find((i) => i.label.includes('index.html'));
  expect(top?.level).toBe('fail');
  expect(top?.detail).toContain('site');
  // / 로 시작하는 주소
  const abs = checkWebZip(entries.map((e) => (e.path === 'index.html' ? { ...e, data: Buffer.from('<script src="/assets/a.js"></script>') } : e)));
  expect(abs.find((i) => i.label.includes('/ 로 시작'))?.level).toBe('fail');
});

test('웹으로 내보내기: 플레이어 틀이 없으면 쉬운 말로 알리고 zip 을 안 만듦', async () => {
  const session = new ProjectSession({ workRoot: join(tmp, 'work'), templateDir: TEMPLATE, commonDir: COMMON, appVersion: 'test' });
  await session.newProject();
  const zipFile = join(tmp, 'a.zip');
  await expect(exportWeb(session, join(tmp, 'no-player'), zipFile)).rejects.toThrow(/플레이어/);
  expect(existsSync(zipFile)).toBe(false);
});
