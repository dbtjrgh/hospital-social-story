// .ssproj — 프로젝트 파일 자체 포맷 (본인 결정 2026-10-08, CLAUDE.md 1-c)
// 일반 압축 프로그램으로 풀 수 없게: zip 이 아니라 우리 구조 + 파일마다 압축·암호화.
// Electron 없이 Node 기본 기능(crypto·zlib·fs)만 씀 → 자동 점검(tests/ssproj.spec.ts)에서 바로 시험 가능.
//
// 구조 (숫자는 리틀 엔디언)
//   머리 32바이트: 'SSPJ' | 컨테이너 버전 u16 | 표시 u16 (1 = 암호화) | 목록 위치 u64 | 목록 길이 u32 | 0 채움
//   파일 내용들: 하나마다 [IV 12][인증 태그 16][암호문]. 암호문 = AES-256-GCM(필요하면 deflateRaw 한 원본), AAD = 경로
//   목록: 같은 방식으로 암호화한 JSON { entries: [{ path, offset, length, size, deflate }] }, AAD = '#index'
// 한계 (본인에게 알림): 키가 앱 안에 있으므로 앱을 뜯어보는 사람까지는 못 막음. 목표는 "압축 프로그램·이름 바꾸기로는 안 열림"
//   + 망가지거나 고친 파일을 열 때 알아챔 (GCM 인증 태그).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { open, readdir, readFile, rename, rm, stat, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

export const SSPROJ_EXT = '.ssproj';
const MAGIC = Buffer.from('SSPJ', 'ascii');
const CONTAINER_VERSION = 1;
const FLAG_ENCRYPTED = 1;
const HEADER_SIZE = 32;
const IV_SIZE = 12;
const TAG_SIZE = 16;
const INDEX_AAD = '#index';
/** 이미 압축된 형식은 다시 압축하지 않음 (줄지 않고 느리기만 함) */
const STORED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp3', '.m4a', '.ogg', '.mp4', '.webm']);

/** 앱 안에 둔 키 (위 "한계" 참고). 공개본은 실제 제품과 다른 값이라 서로의 파일을 못 엶. 바꾸면 예전 파일을 못 여므로 컨테이너 버전과 같이만 바꿀 것 */
const KEY = createHash('sha256').update('example:social-story:ssproj:v1').digest();

/** 열 때 나는 문제를 사용자에게 쉬운 말로 보여 주려고 종류를 나눔 */
export type SsprojErrorKind = 'not-ssproj' | 'newer' | 'damaged';
export class SsprojError extends Error {
  constructor(
    readonly kind: SsprojErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'SsprojError';
  }
}

interface IndexEntry {
  path: string;
  offset: number;
  length: number;
  /** 원본 크기 */
  size: number;
  deflate: boolean;
}

function seal(plain: Buffer, aad: string): Buffer {
  const iv = randomBytes(IV_SIZE);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

function unseal(blob: Buffer, aad: string): Buffer {
  if (blob.length < IV_SIZE + TAG_SIZE) throw new SsprojError('damaged', '파일 일부가 잘려 있어요');
  const decipher = createDecipheriv('aes-256-gcm', KEY, blob.subarray(0, IV_SIZE));
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(blob.subarray(IV_SIZE, IV_SIZE + TAG_SIZE));
  try {
    return Buffer.concat([decipher.update(blob.subarray(IV_SIZE + TAG_SIZE)), decipher.final()]);
  } catch {
    throw new SsprojError('damaged', '파일이 망가졌거나 다른 프로그램이 고쳤어요');
  }
}

/** 폴더 안 파일 경로 (슬래시, 정렬). 숨김 파일(.)은 뺌 */
async function listFiles(dir: string, base = dir, out: string[] = []): Promise<string[]> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await listFiles(p, base, out);
    else if (e.isFile()) out.push(relative(base, p).split(sep).join('/'));
  }
  return out.sort();
}

/** 목록의 경로가 풀 폴더 밖을 가리키지 않는지 (../ · 절대 경로 막기) */
function safeTarget(root: string, path: string): string {
  const target = resolve(root, path);
  if (!path || path.includes('\\') || path.startsWith('/') || (target !== root && !target.startsWith(root + sep))) {
    throw new SsprojError('damaged', `파일 목록에 잘못된 경로가 있어요: ${path}`);
  }
  return target;
}

/**
 * 폴더(sourceDir) 전체를 .ssproj 하나로 저장. 안전하게: 임시 파일에 다 쓴 뒤 바꿔치기, 직전 파일은 <이름>.bak 으로 남김
 * (자체 포맷이라 깨지면 다른 도구로 살릴 수 없어서 — CLAUDE.md 1-c ④)
 */
export async function writeSsproj(sourceDir: string, filePath: string): Promise<void> {
  const files = await listFiles(sourceDir);
  const tmp = `${filePath}.tmp`;
  const fh = await open(tmp, 'w');
  try {
    const entries: IndexEntry[] = [];
    let offset = HEADER_SIZE;
    await fh.write(Buffer.alloc(HEADER_SIZE), 0, HEADER_SIZE, 0); // 머리는 마지막에 채움
    for (const path of files) {
      const raw = await readFile(join(sourceDir, path));
      const deflate = !STORED_EXT.has(extname(path).toLowerCase());
      const blob = seal(deflate ? deflateRawSync(raw) : raw, path);
      await fh.write(blob, 0, blob.length, offset);
      entries.push({ path, offset, length: blob.length, size: raw.length, deflate });
      offset += blob.length;
    }
    const index = seal(deflateRawSync(Buffer.from(JSON.stringify({ entries }), 'utf8')), INDEX_AAD);
    await fh.write(index, 0, index.length, offset);

    const header = Buffer.alloc(HEADER_SIZE);
    MAGIC.copy(header, 0);
    header.writeUInt16LE(CONTAINER_VERSION, 4);
    header.writeUInt16LE(FLAG_ENCRYPTED, 6);
    header.writeBigUInt64LE(BigInt(offset), 8);
    header.writeUInt32LE(index.length, 16);
    await fh.write(header, 0, HEADER_SIZE, 0);
    await fh.sync();
  } finally {
    await fh.close();
  }
  // 직전 저장본을 .bak 으로, 새 파일을 제자리로
  const exists = await stat(filePath).then(
    () => true,
    () => false,
  );
  if (exists) await copyFile(filePath, `${filePath}.bak`);
  await rename(tmp, filePath);
}

/** .ssproj 를 폴더(targetDir, 비어 있어야 함)에 모두 풂. 문제가 있으면 SsprojError */
export async function readSsproj(filePath: string, targetDir: string): Promise<void> {
  const fh = await open(filePath, 'r');
  try {
    const { size } = await fh.stat();
    const header = Buffer.alloc(HEADER_SIZE);
    const { bytesRead } = await fh.read(header, 0, HEADER_SIZE, 0);
    if (bytesRead < HEADER_SIZE || !header.subarray(0, 4).equals(MAGIC)) {
      throw new SsprojError('not-ssproj', '병원 검사 연습 프로젝트 파일(.ssproj)이 아니에요');
    }
    const version = header.readUInt16LE(4);
    if (version > CONTAINER_VERSION) {
      throw new SsprojError('newer', '더 새로운 버전의 앱에서 만든 파일이에요. 앱을 새 버전으로 바꿔 주세요');
    }
    const indexOffset = Number(header.readBigUInt64LE(8));
    const indexLength = header.readUInt32LE(16);
    if (indexOffset + indexLength > size || indexOffset < HEADER_SIZE) throw new SsprojError('damaged', '파일 일부가 잘려 있어요');

    const read = async (offset: number, length: number) => {
      const buf = Buffer.alloc(length);
      const r = await fh.read(buf, 0, length, offset);
      if (r.bytesRead < length) throw new SsprojError('damaged', '파일 일부가 잘려 있어요');
      return buf;
    };
    let entries: IndexEntry[];
    try {
      entries = JSON.parse(inflateRawSync(unseal(await read(indexOffset, indexLength), INDEX_AAD)).toString('utf8')).entries;
    } catch (err) {
      if (err instanceof SsprojError) throw err;
      throw new SsprojError('damaged', '파일 목록을 읽지 못했어요');
    }
    if (!Array.isArray(entries)) throw new SsprojError('damaged', '파일 목록을 읽지 못했어요');

    const root = resolve(targetDir);
    for (const e of entries) {
      const target = safeTarget(root, e.path);
      if (e.offset < HEADER_SIZE || e.offset + e.length > indexOffset) throw new SsprojError('damaged', '파일 일부가 잘려 있어요');
      const plain = unseal(await read(e.offset, e.length), e.path);
      const data = e.deflate ? inflateRawSync(plain) : plain;
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, data);
    }
  } finally {
    await fh.close();
  }
}

/** 폴더 비우기·지우기 (작업 폴더 정리용) */
export async function removeDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
