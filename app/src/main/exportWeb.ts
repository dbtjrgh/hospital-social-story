// 웹으로 내보내기 = 파일 → 빌드 (CLAUDE.md 1-c ⑤단계)
// 결과: zip 하나. 맨 위에 index.html + assets/ + content/ (폴더 한 겹 없이) → 서버가 아무 하위 경로에 풀어도 그대로 돎 (상대 경로·해시 주소)
//   플레이어 틀 = 개발할 때 한 번 빌드해 앱 안에 넣어 둔 것 (out/player — tools/build-player.mjs, 편집기 코드 없음)
//   + 프로젝트 원고 = content/project.json (화면이 시작할 때 읽음 — 웹 빌드 yarn build 와 같은 모양)
//   + 프로젝트 사진·소리 = content/<경로> (플레이어 틀의 공통 그림과 같은 경로면 프로젝트 것)
// 사용자 PC 에는 Node·Vite 가 없음 → 파일을 모아 묶기만 함. Electron 을 부르지 않음 → 자동 점검에서 바로 시험 (tests/ssproj.spec.ts)
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { ProjectSession } from './project';
import { writeZip, type ZipEntry } from './zip';

/** 플레이어가 읽는 원고 파일 (tools/hospital-pack.mjs PROJECT_FILE 과 같게) */
const PROJECT_FILE = 'project.json';

/** 밑줄·점으로 시작하는 파일은 설정·메모용 (_temp.json 등) → 내보내지 않음 (tools/hospital-pack.mjs 와 같은 규칙) */
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

export interface ExportResult {
  file: string;
  bytes: number;
  count: number;
}

/** 플레이어 틀이 제대로 있는지 (없으면 쉬운 말로 — 개발 때 yarn build:player 를 안 한 경우) */
export function playerReady(playerDir: string): boolean {
  return existsSync(join(playerDir, 'index.html'));
}

/** 원고가 플레이어에서 열릴 모양인지 (열리지 않을 것만 — 빠진 사진·소리는 편집기 화면이 미리 보여 줌) */
function checkProject(data: Awaited<ReturnType<ProjectSession['projectData']>>): string[] {
  const problems: string[] = [];
  const ids = new Set((data.exams as { id?: string }[]).map((e) => e?.id));
  const listed = data.hospital?.exams ?? [];
  if (!Array.isArray(listed) || listed.length === 0) problems.push('보여 줄 검사가 하나도 없어요');
  else for (const id of listed) if (!ids.has(id)) problems.push(`검사 원고가 없어요: ${id}`);
  return problems;
}

export async function exportWeb(session: ProjectSession, playerDir: string, zipFile: string): Promise<ExportResult> {
  if (!playerReady(playerDir)) throw new Error('웹 결과물의 틀(플레이어)이 앱에 없어요. 앱을 다시 설치해 주세요. (개발 중이면 yarn build:player)');
  const data = await session.projectData();
  const problems = checkProject(data);
  if (problems.length > 0) throw new Error(problems.join('\n'));

  // 같은 경로면 뒤의 것이 이김: 플레이어 틀 → 프로젝트 사진·소리 → 원고
  const files = new Map<string, () => Promise<Buffer>>();
  for (const rel of await walk(playerDir)) {
    if (rel === `content/${PROJECT_FILE}`) continue;
    files.set(rel, () => readFile(join(playerDir, ...rel.split('/'))));
  }
  const mediaDir = join(session.workDir, 'media');
  for (const rel of await walk(mediaDir)) files.set(`content/${rel}`, () => readFile(join(mediaDir, ...rel.split('/'))));
  const projectJson = Buffer.from(JSON.stringify(data), 'utf8');
  files.set(`content/${PROJECT_FILE}`, async () => projectJson);

  // index.html 을 맨 앞에 (압축 프로그램 목록에서 먼저 보이게), 나머지는 경로 순
  const order = [...files.keys()].sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
  const entries: ZipEntry[] = [];
  for (const path of order) entries.push({ path, data: await files.get(path)!() });
  const { bytes, count } = await writeZip(entries, zipFile);
  return { file: zipFile, bytes, count };
}
