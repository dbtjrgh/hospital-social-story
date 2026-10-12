// 열린 프로젝트 (편집기, CLAUDE.md 1-c ②단계)
// 프로젝트 = 병원 하나. 열면 작업 폴더에 풀어 두고(병원 팩과 같은 모양: hospital.json · exams/*.json · media/ + manifest.json),
// 저장하면 작업 폴더를 .ssproj 하나로 묶음 (./ssproj.ts). 화면은 projectData()로 원고를, project:// 주소로 사진·소리를 받음.
// Electron 을 부르지 않음 → 경로는 밖(src/main/index.ts)에서 받음, 자동 점검에서 바로 시험 가능.
import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, extname, join, relative, sep } from 'node:path';
import { readSsproj, removeDir, SSPROJ_EXT, writeSsproj } from './ssproj';

/** project.json 형식 버전 (src/renderer/src/content/project.ts 의 PROJECT_FORMAT 과 같게) */
export const PROJECT_FORMAT = 1;

export interface ProjectPaths {
  /** 작업 폴더들을 둘 곳 (앱 사용자 폴더 아래) */
  workRoot: string;
  /** 새 프로젝트의 기본 틀 (병원 팩 폴더: 지금은 예시 병원 원고·임시 사진) */
  templateDir: string;
  /** 앱에 들어 있는 공통 그림·효과음 (content/common · content/sounds) */
  commonDir: string;
  appVersion: string;
}

/** 화면에 넘기는 프로젝트 데이터 = content/project.json 과 같은 모양 */
export interface ProjectData {
  format: number;
  hospital: { id: string; name: string; exams: string[] };
  exams: unknown[];
  media: { files: string[]; temp: string[] };
}

/** 밑줄·점으로 시작하는 파일은 설정·메모용 (_temp.json 등) → 화면 목록에서 뺌 (tools/hospital-pack.mjs 와 같은 규칙) */
const isHidden = (name: string) => name.startsWith('_') || name.startsWith('.');

async function walk(dir: string, base = dir, out: string[] = []): Promise<string[]> {
  if (!existsSync(dir)) return out;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (isHidden(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, base, out);
    else if (e.isFile()) out.push(relative(base, p).split(sep).join('/'));
  }
  return out;
}

async function fingerprint(file: string): Promise<string> {
  return createHash('sha1')
    .update(await readFile(file))
    .digest('hex')
    .slice(0, 16);
}

/**
 * 편집 한 가지 (③단계). 화면(편집 모드)이 보내고 앱이 작업 폴더에 적용함
 *   put    = 사진·소리 파일 넣기·바꾸기 (media/<path>)
 *   remove = 사진·소리 파일 빼기
 *   json   = 원고 한 칸 바꾸기 (file = hospital.json 또는 exams/<id>.json, pointer = JSON Pointer, value 가 undefined 면 칸을 지움)
 *   reset  = 사진을 기본 사진으로 (새 프로젝트의 기본 틀에 있던 파일·파일 이름, 배치도 처음으로). 기본 틀에 없으면 빈 자리
 *            field = 원고에서 그 사진이 적힌 칸 (영상으로 바꿔 파일 이름이 달라졌으면 원래 이름으로 돌림)
 */
export type EditOp =
  | { kind: 'put'; path: string; bytes: Uint8Array }
  | { kind: 'remove'; path: string }
  | { kind: 'json'; file: string; pointer: string; value?: unknown }
  | { kind: 'reset'; path: string; field?: { file: string; image: string; view: string } };

/** 되돌리기 한 칸: 바뀐 파일마다 바뀌기 전·후 내용 (null = 파일 없음) */
interface HistoryStep {
  label: string;
  changes: { file: string; before: Buffer | null; after: Buffer | null }[];
}

export interface EditState {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  dirty: boolean;
  /** 저장한 파일이 있는지 (없으면 "새 프로젝트") */
  hasFile: boolean;
  /** 마지막으로 저장한 때 (ISO) */
  savedAt: string | null;
  autoSaved: boolean;
}

/** 되돌리기 기록은 이만큼까지 (사진이 많으면 메모리를 많이 쓰므로) */
const HISTORY_MAX = 60;

function safeMediaPath(path: string): boolean {
  return !!path && !path.includes('\\') && !path.split('/').some((p) => !p || p === '..' || isHidden(p));
}

/** 원고 파일만 고칠 수 있음 */
function safeJsonFile(file: string): boolean {
  return file === 'hospital.json' || /^exams\/[A-Za-z0-9-]+\.json$/.test(file);
}

function pointerParts(pointer: string): string[] {
  return pointer
    .split('/')
    .slice(1)
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/** JSON Pointer 로 한 칸 읽기 (없으면 undefined) */
function getByPointer(root: unknown, pointer: string): unknown {
  let node = root;
  for (const part of pointerParts(pointer)) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/** JSON Pointer(/steps/3/audio)로 한 칸 바꾸기. 부모가 없으면 오류 */
function setByPointer(root: unknown, pointer: string, value: unknown): void {
  const parts = pointerParts(pointer);
  if (parts.length === 0) throw new Error('바꿀 칸이 없어요');
  let node = root as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) {
    const next = (node as Record<string, unknown>)[part];
    if (!next || typeof next !== 'object') throw new Error(`원고에 없는 칸이에요: ${pointer}`);
    node = next as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (value === undefined) {
    if (Array.isArray(node)) node.splice(Number(last), 1);
    else delete node[last];
  } else node[last] = value;
}

export class ProjectSession {
  /** 지금 작업 폴더 */
  workDir = '';
  /** 저장한 .ssproj 경로 (새 프로젝트면 null → 저장할 때 "다른 이름으로") */
  filePath: string | null = null;
  private history: HistoryStep[] = [];
  /** history 중 몇 칸까지 적용됐는지 */
  private position = 0;
  /** 저장했을 때의 position (-1 = 저장한 상태로 못 돌아감) */
  private savedPosition = 0;
  private savedAt: string | null = null;
  private autoSaved = false;

  constructor(private readonly paths: ProjectPaths) {}

  /** 저장하지 않은 바뀐 내용이 있는지 */
  get dirty(): boolean {
    return this.position !== this.savedPosition;
  }

  editState(): EditState {
    return {
      canUndo: this.position > 0,
      canRedo: this.position < this.history.length,
      undoLabel: this.history[this.position - 1]?.label ?? null,
      redoLabel: this.history[this.position]?.label ?? null,
      dirty: this.dirty,
      hasFile: !!this.filePath,
      savedAt: this.savedAt,
      autoSaved: this.autoSaved,
    };
  }

  private async readMaybe(rel: string): Promise<Buffer | null> {
    const file = join(this.workDir, ...rel.split('/'));
    return existsSync(file) ? readFile(file) : null;
  }

  private async writeMaybe(rel: string, data: Buffer | null): Promise<void> {
    const file = join(this.workDir, ...rel.split('/'));
    if (data === null) {
      await rm(file, { force: true });
      return;
    }
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data);
  }

  /** 편집 적용 (한 번 = 되돌리기 한 칸). 하나라도 틀리면 아무것도 안 바꿈 */
  /** '기본 사진으로' 를 put·remove·json 으로 풀기 (기본 틀 = 새 프로젝트를 만들 때 복사하는 병원 팩) */
  private async expandReset(op: Extract<EditOp, { kind: 'reset' }>): Promise<EditOp[]> {
    const template = this.paths.templateDir;
    let original = op.path;
    if (op.field) {
      if (!safeJsonFile(op.field.file)) throw new Error(`고칠 수 없는 파일이에요: ${op.field.file}`);
      const tplFile = join(template, ...op.field.file.split('/'));
      if (existsSync(tplFile)) {
        const value = getByPointer(JSON.parse(await readFile(tplFile, 'utf8')), op.field.image);
        if (typeof value === 'string' && safeMediaPath(value)) original = value;
      }
    }
    const tplMedia = join(template, 'media', ...original.split('/'));
    const out: EditOp[] = [];
    if (original !== op.path) out.push({ kind: 'remove', path: op.path });
    out.push(existsSync(tplMedia) ? { kind: 'put', path: original, bytes: await readFile(tplMedia) } : { kind: 'remove', path: original });
    if (op.field) {
      if (original !== op.path) out.push({ kind: 'json', file: op.field.file, pointer: op.field.image, value: original });
      out.push({ kind: 'json', file: op.field.file, pointer: op.field.view });
    }
    return out;
  }

  async apply(ops: EditOp[], label: string): Promise<void> {
    const expanded: EditOp[] = [];
    for (const op of ops) expanded.push(...(op.kind === 'reset' ? await this.expandReset(op) : [op]));
    ops = expanded;
    // 파일마다 바뀌기 전 내용과 바뀐 뒤 내용을 먼저 모두 계산 (중간에 실패하면 작업 폴더는 그대로)
    const touched = new Map<string, { before: Buffer | null; after: Buffer | null }>();
    const current = async (rel: string) => {
      const t = touched.get(rel);
      if (t) return t.after;
      const before = await this.readMaybe(rel);
      touched.set(rel, { before, after: before });
      return before;
    };
    for (const op of ops) {
      if (op.kind === 'put' || op.kind === 'remove') {
        if (!safeMediaPath(op.path)) throw new Error(`잘못된 파일 자리예요: ${op.path}`);
        const rel = `media/${op.path}`;
        await current(rel);
        touched.get(rel)!.after = op.kind === 'put' ? Buffer.from(op.bytes) : null;
      } else if (op.kind === 'json') {
        if (!safeJsonFile(op.file)) throw new Error(`고칠 수 없는 파일이에요: ${op.file}`);
        const raw = await current(op.file);
        if (!raw) throw new Error(`원고가 없어요: ${op.file}`);
        const data = JSON.parse(raw.toString('utf8'));
        setByPointer(data, op.pointer, op.value);
        touched.get(op.file)!.after = Buffer.from(`${JSON.stringify(data, null, 2)}\n`, 'utf8');
      }
    }
    const changes = [...touched]
      .map(([file, t]) => ({ file, ...t }))
      .filter((c) => !(c.before === null && c.after === null) && !(c.before && c.after && c.before.equals(c.after)));
    if (changes.length === 0) return;
    for (const c of changes) await this.writeMaybe(c.file, c.after);

    // 되돌린 뒤 새로 고치면 "다시 하기"는 버림
    this.history.splice(this.position);
    if (this.savedPosition > this.position) this.savedPosition = -1;
    this.history.push({ label, changes });
    this.position = this.history.length;
    if (this.history.length > HISTORY_MAX) {
      const drop = this.history.length - HISTORY_MAX;
      this.history.splice(0, drop);
      this.position -= drop;
      this.savedPosition = this.savedPosition >= drop ? this.savedPosition - drop : -1;
    }
  }

  async undo(): Promise<boolean> {
    if (this.position === 0) return false;
    const step = this.history[this.position - 1];
    for (const c of [...step.changes].reverse()) await this.writeMaybe(c.file, c.before);
    this.position -= 1;
    return true;
  }

  async redo(): Promise<boolean> {
    if (this.position >= this.history.length) return false;
    const step = this.history[this.position];
    for (const c of step.changes) await this.writeMaybe(c.file, c.after);
    this.position += 1;
    return true;
  }

  /** 창 제목·대화창에 보일 이름 */
  get displayName(): string {
    return this.filePath ? basename(this.filePath, SSPROJ_EXT) : '새 프로젝트';
  }

  /** 지난번에 남은 작업 폴더 정리 (앱을 강제로 끄면 남을 수 있음) */
  async cleanupStale(): Promise<void> {
    await removeDir(this.paths.workRoot);
  }

  private async freshWorkDir(): Promise<string> {
    const dir = join(this.paths.workRoot, randomUUID());
    await mkdir(dir, { recursive: true });
    return dir;
  }

  private async switchTo(dir: string, filePath: string | null): Promise<void> {
    const old = this.workDir;
    this.workDir = dir;
    this.filePath = filePath;
    this.history = [];
    this.position = 0;
    this.savedPosition = 0;
    this.savedAt = null;
    this.autoSaved = false;
    if (old) await removeDir(old);
  }

  /** 새 프로젝트 = 기본 틀을 복사 (원고·사진, 숨김 파일 _temp.json 포함 → 임시 사진 표시 유지) */
  async newProject(): Promise<void> {
    const dir = await this.freshWorkDir();
    await cp(this.paths.templateDir, dir, { recursive: true });
    await this.switchTo(dir, null);
  }

  /** .ssproj 열기. 실패하면 지금 프로젝트는 그대로 두고 오류를 던짐 (SsprojError 면 쉬운 말) */
  async open(filePath: string): Promise<void> {
    const dir = await this.freshWorkDir();
    try {
      await readSsproj(filePath, dir);
      if (!existsSync(join(dir, 'hospital.json'))) throw new Error('프로젝트 안에 병원 설정(hospital.json)이 없어요');
    } catch (err) {
      await removeDir(dir);
      throw err;
    }
    await this.switchTo(dir, filePath);
  }

  /** 저장 (filePath 를 주면 그 이름으로 = 다른 이름으로 저장). auto = 자동 저장 */
  async save(filePath = this.filePath, auto = false): Promise<void> {
    if (!filePath) throw new Error('저장할 파일 이름이 없어요');
    const manifest = {
      app: 'hospital-social-story',
      format: PROJECT_FORMAT,
      appVersion: this.paths.appVersion,
      savedAt: new Date().toISOString(),
    };
    await writeFile(join(this.workDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await writeSsproj(this.workDir, filePath);
    this.filePath = filePath;
    this.savedPosition = this.position;
    this.savedAt = manifest.savedAt;
    this.autoSaved = auto;
  }

  /** 화면에 넘길 데이터 (원고는 읽을 때마다 새로 → 편집한 내용이 바로 보임) */
  async projectData(): Promise<ProjectData> {
    const hospital = JSON.parse(await readFile(join(this.workDir, 'hospital.json'), 'utf8'));
    const examDir = join(this.workDir, 'exams');
    const examFiles = existsSync(examDir) ? (await readdir(examDir)).filter((n) => n.endsWith('.json') && !isHidden(n)).sort() : [];
    const exams = await Promise.all(examFiles.map(async (n) => JSON.parse(await readFile(join(examDir, n), 'utf8'))));

    const mediaDir = join(this.workDir, 'media');
    const own = await walk(mediaDir);
    const common = await walk(this.paths.commonDir);
    let prints: Record<string, string> = {};
    try {
      prints = JSON.parse(await readFile(join(mediaDir, '_temp.json'), 'utf8')).files ?? {};
    } catch {
      // 임시 사진 목록이 없으면 전부 진짜 사진으로 봄
    }
    const temp: string[] = [];
    for (const f of own) if (prints[f] && prints[f] === (await fingerprint(join(mediaDir, f)))) temp.push(f);
    const files = [...new Set([...own, ...common])].sort();
    return { format: PROJECT_FORMAT, hospital, exams, media: { files, temp } };
  }

  /**
   * 사진·소리 파일 찾기 (project://media/<경로>): 프로젝트 media/ 에 있으면 그것, 없으면 앱의 공통 그림.
   * 폴더 밖·숨김 파일은 null
   */
  resolveMedia(path: string): string | null {
    if (!safeMediaPath(path)) return null;
    const own = join(this.workDir, 'media', ...path.split('/'));
    if (existsSync(own)) return own;
    const common = join(this.paths.commonDir, ...path.split('/'));
    return existsSync(common) ? common : null;
  }
}

/** 파일 이름에 확장자가 없으면 .ssproj 를 붙임 (저장 대화창에서 이름만 친 경우) */
export function withSsprojExt(filePath: string): string {
  return extname(filePath).toLowerCase() === SSPROJ_EXT ? filePath : `${filePath}${SSPROJ_EXT}`;
}
