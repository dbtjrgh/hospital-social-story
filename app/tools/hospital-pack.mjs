// 병원 팩 (CLAUDE.md 5-2장): hospitals/<id>/ = hospital.json(설정) + exams/*.json(원고) + media/(사진·음원)
// 공통 엔진(src/renderer)은 그대로, 병원 자료만 바꿔 끼움. Vite 설정(tools/renderer-config.ts)과 검사기(check.mjs)가 같이 씀.
//
// 사진·음원 주소는 모두 "content/<경로>" 하나로 통일:
//   병원 파일(hospitals/<id>/media/<경로>)이 있으면 그것, 없으면 공통 그림(src/renderer/public/content/<경로>).
//   → 병원이 준 파일을 같은 이름으로 media/ 에 넣으면 끝 (코드·원고 수정 없음).
// "임시 사진" 판별: media/_temp.json 에 시안에서 자른 파일의 지문(sha1)을 적어 둠.
//   같은 이름의 병원 사진으로 바꾸면 지문이 달라져 저절로 "진짜 사진"이 됨.
import { createHash } from 'node:crypto';
import { cpSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 앱 폴더 (app/ = 코드·설정·node_modules 가 다 여기) */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** 프로젝트 맨 위 (app/ 의 부모): 코드가 아닌 것 — 병원 자료 hospitals/, 문서, 제작 방향서 _mockups/, 발표 presentation/ */
export const PROJECT_ROOT = dirname(ROOT);
export const HOSPITALS_DIR = join(PROJECT_ROOT, 'hospitals');
/** 모든 병원이 같이 쓰는 그림 (스티커·순서 그림 등, 우리가 만든 것) */
export const COMMON_DIR = join(ROOT, 'src', 'renderer', 'public', 'content');
export const DEFAULT_HOSPITAL = 'SampleHospital';

/** 플레이어가 시작할 때 읽는 파일: content/project.json = 병원 설정 + 검사 원고 + 사진·소리 목록 (src/renderer/src/content/project.ts) */
export const PROJECT_FILE = 'project.json';
export const PROJECT_FORMAT = 1;

const CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/** 밑줄·점으로 시작하는 파일은 설정·메모용 (_temp.json, _README.md 등) → 주소로 내보내지 않음 */
const isHidden = (name) => name.startsWith('_') || name.startsWith('.');

/** hospitals/ 아래 병원 id 목록 (_template 같은 밑줄 폴더 제외) */
export function listHospitals() {
  if (!existsSync(HOSPITALS_DIR)) return [];
  return readdirSync(HOSPITALS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !isHidden(d.name))
    .map((d) => d.name)
    .sort();
}

export function hospitalDir(id) {
  return join(HOSPITALS_DIR, id);
}

/** 쓸 병원 id. 인자 > 환경 변수 HOSPITAL > 기본값. 없는 병원이면 알아보기 쉬운 오류 */
export function resolveHospital(id = process.env.HOSPITAL || DEFAULT_HOSPITAL) {
  if (!existsSync(join(hospitalDir(id), 'hospital.json'))) {
    throw new Error(`병원 팩이 없어요: hospitals/${id}/hospital.json (있는 병원: ${listHospitals().join(', ') || '없음'})`);
  }
  return id;
}

function walk(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (isHidden(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(relative(base, p).split(sep).join('/'));
  }
  return out;
}

export function fingerprint(file) {
  return createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 16);
}

/**
 * 이 병원에서 쓸 수 있는 파일. files = 병원 파일 + 공통 그림 (경로가 같으면 병원 것이 우선)
 * temp = 시안에서 자른 임시 사진 그대로인 병원 파일
 */
export function mediaIndex(id) {
  const mediaDir = join(hospitalDir(id), 'media');
  const hospitalFiles = walk(mediaDir);
  const commonFiles = walk(COMMON_DIR);
  let prints = {};
  try {
    prints = JSON.parse(readFileSync(join(mediaDir, '_temp.json'), 'utf8')).files ?? {};
  } catch {
    // 임시 사진 목록이 없으면 전부 진짜 사진으로 봄
  }
  const temp = hospitalFiles.filter((f) => prints[f] && prints[f] === fingerprint(join(mediaDir, f)));
  const files = [...new Set([...hospitalFiles, ...commonFiles])].sort();
  return { mediaDir, files, hospitalFiles, commonFiles, temp };
}

/**
 * 플레이어가 읽는 프로젝트 데이터 (content/project.json). 원고는 실행할 때 읽음 → 앱(편집기)이 Node·Vite 없이 빌드할 수 있게 (CLAUDE.md 1-c)
 * exams = exams/*.json 전부 (어느 검사를 보일지는 hospital.json 의 exams 순서로 플레이어가 고름)
 */
export function projectData(id) {
  const dir = hospitalDir(id);
  const hospital = JSON.parse(readFileSync(join(dir, 'hospital.json'), 'utf8'));
  const examDir = join(dir, 'exams');
  const exams = existsSync(examDir)
    ? readdirSync(examDir)
        .filter((n) => n.endsWith('.json') && !isHidden(n))
        .sort()
        .map((n) => JSON.parse(readFileSync(join(examDir, n), 'utf8')))
    : [];
  const { files, temp } = mediaIndex(id);
  return { format: PROJECT_FORMAT, hospital, exams, media: { files, temp } };
}

/** Vite 플러그인: 개발 서버에서 project.json·병원 사진 주기 + 빌드 때 그 병원 사진만 content/ 로 복사하고 project.json 쓰기 */
/**
 * withContent = 빌드에 그 병원 사진·project.json 을 넣을지. 편집기(Electron) 화면 빌드는 false — 내용은 열린 프로젝트에서 옴 (공통 그림만 들어감)
 */
export function hospitalPack(id, { withContent = true } = {}) {
  const mediaDir = join(hospitalDir(id), 'media');
  return {
    name: 'hospital-pack',

    configureServer(server) {
      // 함수를 돌려주지 않고 바로 등록 → Vite 의 public 폴더보다 먼저 → 병원 파일이 공통 그림보다 우선
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (!url.startsWith('/content/')) return next();
        // 원고·목록은 요청마다 새로 만듦 → 원고를 고치고 새로고침하면 바로 반영
        if (url === `/content/${PROJECT_FILE}`) {
          let body;
          try {
            body = JSON.stringify(projectData(id));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(`원고를 읽지 못했어요 (yarn check:content 로 확인): ${err instanceof Error ? err.message : err}`);
            return;
          }
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(body);
          return;
        }
        let rel;
        try {
          rel = decodeURIComponent(url.slice('/content/'.length));
        } catch {
          return next();
        }
        const file = resolve(mediaDir, rel);
        if (!file.startsWith(mediaDir + sep) || rel.split('/').some(isHidden)) return next();
        if (!existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(file).pipe(res);
      });

      // 원고·사진·음원을 넣거나 바꾸면 화면 새로고침 (project.json 은 요청마다 새로 만듦)
      const packDir = hospitalDir(id);
      server.watcher.add(packDir);
      const onMediaChange = (file) => {
        const abs = resolve(file);
        if (!abs.startsWith(packDir + sep) && !abs.startsWith(COMMON_DIR + sep)) return;
        server.ws.send({ type: 'full-reload' });
      };
      for (const event of ['add', 'unlink', 'change']) server.watcher.on(event, onMediaChange);
    },

    // 빌드: src/renderer/public/ 의 공통 그림은 Vite 가 복사함. 병원 파일을 그 위에 덮어씀 (같은 경로면 병원 것)
    writeBundle(options) {
      if (!options.dir || !withContent) return;
      if (existsSync(mediaDir)) {
        cpSync(mediaDir, join(options.dir, 'content'), {
          recursive: true,
          filter: (src) => !isHidden(basename(src)),
        });
      }
      mkdirSync(join(options.dir, 'content'), { recursive: true });
      writeFileSync(join(options.dir, 'content', PROJECT_FILE), JSON.stringify(projectData(id)));
    },
  };
}
