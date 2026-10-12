// zip 파일 쓰기 (웹으로 내보내기 — CLAUDE.md 1-c ⑤단계). 설치한 exe 안에서 돌아야 해서 Node 기본 기능(zlib)만 씀, 추가 라이브러리 없음.
// 일반 zip(PKZIP 2.0): 파일마다 [로컬 머리 + 내용] → 끝에 [중앙 목록 + 끝 표시]. 4GB·65535개 아래만 (웹 결과물은 그보다 훨씬 작음)
// 이미 압축된 형식(사진·mp3·영상)은 그대로 담고(stored), 나머지(html·js·css·json·svg·wav)는 deflate.
// Electron 을 부르지 않음 → 자동 점검에서 바로 시험 (tests/ssproj.spec.ts)
import { open, readFile, rename } from 'node:fs/promises';
import { extname } from 'node:path';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  /** zip 안 경로 (슬래시, 맨 앞 / 없음) */
  path: string;
  data: Buffer;
}

const STORED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp3', '.m4a', '.ogg', '.mp4', '.webm', '.woff2', '.zip']);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** zip 안 날짜·시각 (MS-DOS 형식, 지금 시각) */
function dosTime(d = new Date()): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** entries 를 zip 파일 하나로 (임시 파일에 다 쓴 뒤 그 이름으로 — 중간에 실패해도 반쯤 쓴 zip 이 남지 않게) */
export async function writeZip(entries: ZipEntry[], file: string): Promise<{ bytes: number; count: number }> {
  if (entries.length > 0xffff) throw new Error('파일이 너무 많아요 (65535개까지)');
  const { time, date } = dosTime();
  const tmp = `${file}.tmp`;
  const fh = await open(tmp, 'w');
  const central: Buffer[] = [];
  let offset = 0;
  try {
    for (const e of entries) {
      const name = Buffer.from(e.path, 'utf8');
      const stored = STORED_EXT.has(extname(e.path).toLowerCase());
      const body = stored ? e.data : deflateRawSync(e.data, { level: 9 });
      const crc = crc32(e.data);
      if (offset + 30 + name.length + body.length > 0xffffffff) throw new Error('결과물이 너무 커요 (4GB까지)');

      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4); // 풀 수 있는 버전 2.0
      local.writeUInt16LE(0x0800, 6); // 이름이 UTF-8
      local.writeUInt16LE(stored ? 0 : 8, 8);
      local.writeUInt16LE(time, 10);
      local.writeUInt16LE(date, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(body.length, 18);
      local.writeUInt32LE(e.data.length, 22);
      local.writeUInt16LE(name.length, 26);
      local.writeUInt16LE(0, 28);
      await fh.write(Buffer.concat([local, name]));
      await fh.write(body);

      const cen = Buffer.alloc(46);
      cen.writeUInt32LE(0x02014b50, 0);
      cen.writeUInt16LE(20, 4);
      cen.writeUInt16LE(20, 6);
      cen.writeUInt16LE(0x0800, 8);
      cen.writeUInt16LE(stored ? 0 : 8, 10);
      cen.writeUInt16LE(time, 12);
      cen.writeUInt16LE(date, 14);
      cen.writeUInt32LE(crc, 16);
      cen.writeUInt32LE(body.length, 20);
      cen.writeUInt32LE(e.data.length, 24);
      cen.writeUInt16LE(name.length, 28);
      // 30~44: 덧붙임·설명 길이, 디스크 번호, 속성 = 0
      cen.writeUInt32LE(offset, 42);
      central.push(Buffer.concat([cen, name]));
      offset += 30 + name.length + body.length;
    }
    const dir = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(dir.length, 12);
    end.writeUInt32LE(offset, 16);
    await fh.write(Buffer.concat([dir, end]));
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmp, file);
  return { bytes: offset + central.reduce((n, b) => n + b.length, 0) + 22, count: entries.length };
}

/**
 * zip 읽기 (내보낸 zip 확인 — ./webCheck.ts). 중앙 목록을 따라 파일마다 풀고 크기·CRC 를 확인.
 * 그대로(stored)·deflate 만 (이 앱이 만드는 것과 보통 압축 프로그램이 만드는 것). 폴더 항목은 건너뜀. 틀리면 쉬운 말 오류
 */
export async function readZip(file: string): Promise<ZipEntry[]> {
  const buf = await readFile(file);
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || end + 22 > buf.length) throw new Error('zip 파일이 아니거나 망가졌어요');
  const count = buf.readUInt16LE(end + 10);
  if (count === 0xffff || buf.readUInt32LE(end + 16) === 0xffffffff) throw new Error('너무 큰 zip(ZIP64)은 확인할 수 없어요');
  let p = buf.readUInt32LE(end + 16);
  const out: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip 목록이 망가졌어요');
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    // 이름: UTF-8 표시가 없어도 이 앱·요즘 압축 프로그램은 UTF-8 (옛 한글 cp949 이름은 깨져 보일 수 있음)
    const path = buf.subarray(p + 46, p + 46 + nlen).toString('utf8');
    p += 46 + nlen + xlen + clen;
    if (path.endsWith('/')) continue;
    if (flags & 0x1) throw new Error(`암호가 걸린 zip 은 확인할 수 없어요: ${path}`);
    if (method !== 0 && method !== 8) throw new Error(`이 압축 방식은 확인할 수 없어요 (${method}): ${path}`);
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new Error(`zip 안 파일이 망가졌어요: ${path}`);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    const data = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
    if (data.length !== usize || crc32(data) !== crc) throw new Error(`zip 안 파일이 망가졌어요: ${path}`);
    out.push({ path, data });
  }
  return out;
}
