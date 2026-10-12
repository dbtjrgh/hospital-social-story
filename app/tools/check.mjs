// 원고·자료 검사기: yarn check:content [병원id] [--strict]
// 모든 병원 팩(hospitals/*)의 원고 구조, 쓰면 안 되는 표현, 사진·음원 준비 상태를 봅니다.
//   오류(✗) = 화면이 깨지거나 원칙에 어긋남 → 종료 코드 1 (yarn build 도 멈춤)
//   경고(!) = 고치는 게 좋음 / 자료 = 준비됨·임시·없음 개수와 없는 파일 목록 (병원에서 받을 것)
//   --strict = 납품 직전용: 임시 사진·없는 자료도 오류로
// 원고 모양은 src/renderer/src/content/types.ts 와 같게 맞출 것.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hospitalDir, listHospitals, mediaIndex } from './hospital-pack.mjs';
// 문장 규칙·연습 숫자 범위는 편집기와 같이 씀 (Node 22.18+ 는 .ts 를 타입만 지우고 바로 읽음)
import { PRACTICE_LIMITS, textProblems } from '../src/renderer/src/content/rules.ts';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const only = args.find((a) => !a.startsWith('--'));

const THEMES = ['blue', 'green', 'yellow', 'pink', 'purple'];
const SENSES = ['sound', 'cold', 'pressure', 'light', 'sting', 'smell', 'wait', 'touch'];
const SYNTHS = ['chime', 'xray-beep', 'ecg-beep', 'gel', 'announce', 'tick', 'pad'];
/** 연습 종류와 꼭 있어야 하는 칸 (src/renderer/src/practice/Practice.tsx 에 있는 것만) */
const PRACTICES = {
  hold: ['seconds', 'prompt', 'success'],
  nameCall: [],
  tapArea: ['target', 'prompt', 'success'],
  placePads: ['spots', 'prompt', 'success'],
  sequence: ['items', 'prompt', 'success'],
  breathe: ['count', 'prompt', 'success'],
  lookAway: ['seconds', 'choices', 'prompt', 'success'],
};
/** 원고에서 쓸 수 있는 아이콘 이름 (src/renderer/src/components/Icon.tsx 의 목록을 그대로 읽음) */
const ICONS = (() => {
  const src = readFileSync(new URL('../src/renderer/src/components/Icon.tsx', import.meta.url), 'utf8');
  const paths = src.slice(src.indexOf('const paths'), src.indexOf('} as const'));
  return [...paths.matchAll(/^ {2}([a-zA-Z]+):/gm)].map((m) => m[1]);
})();
const BODY_PARTS = ['head', 'chest', 'belly', 'arm', 'leg'];
const PAD_SPOTS = ['chest-1', 'chest-2', 'chest-3', 'wrist-left', 'wrist-right', 'ankle-left', 'ankle-right'];
const { seconds: SEC, count: CNT } = PRACTICE_LIMITS;
const STEPS_MIN = 8;
const STEPS_MAX = 13; // 진입·순서·스티커판 3쪽 + 단계 = PDF "약 10~15페이지"

const c = {
  red: (s) => `\x1b[31m${s}\x1b[39m`,
  yellow: (s) => `\x1b[33m${s}\x1b[39m`,
  green: (s) => `\x1b[32m${s}\x1b[39m`,
  gray: (s) => `\x1b[90m${s}\x1b[39m`,
  bold: (s) => `\x1b[1m${s}\x1b[22m`,
};

let totalErrors = 0;

function readJson(file, errors) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    errors.push(`${file}: JSON을 읽지 못함 — ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;

function checkHospital(id) {
  const errors = [];
  const warnings = [];
  const dir = hospitalDir(id);
  const config = readJson(join(dir, 'hospital.json'), errors);
  const media = mediaIndex(id);
  const files = new Set(media.files);
  const temp = new Set(media.temp);
  /** 경로 → 쓰는 곳 */
  const used = new Map();
  const useMedia = (path, where, kind = '사진') => {
    if (!isStr(path)) return;
    if (!used.has(path)) used.set(path, { kind, where: [] });
    used.get(path).where.push(where);
  };

  if (config) {
    if (config.id !== id) errors.push(`hospital.json: id "${config.id}" 가 폴더 이름 "${id}" 와 다름`);
    if (!isStr(config.name)) errors.push('hospital.json: name(병원 이름)이 없음');
    if (!Array.isArray(config.exams) || config.exams.length === 0) errors.push('hospital.json: exams(검사 목록)가 비었음');
  }

  const examDir = join(dir, 'exams');
  const examFiles = existsSync(examDir) ? readdirSync(examDir).filter((f) => f.endsWith('.json')) : [];
  const listed = Array.isArray(config?.exams) ? config.exams : [];
  for (const f of examFiles) {
    if (!listed.includes(f.replace(/\.json$/, ''))) warnings.push(`exams/${f}: hospital.json 의 exams 에 없어서 화면에 안 나옴`);
  }

  const summary = [];
  for (const examId of listed) {
    const file = join(examDir, `${examId}.json`);
    useMedia(`covers/${examId}.jpg`, `${examId} 카드`);
    if (!existsSync(file)) {
      summary.push({ examId, steps: '-', note: '원고 없음 → "준비 중" 카드' });
      continue;
    }
    const exam = readJson(file, errors);
    if (!exam) continue;
    const at = (where) => `${examId}${where ? `/${where}` : ''}`;
    const err = (where, msg) => errors.push(`${at(where)}: ${msg}`);
    const warn = (where, msg) => warnings.push(`${at(where)}: ${msg}`);
    /** 사진 배치 (편집기에서 화면으로 조정 — src/renderer/src/content/types.ts ImageView) */
    const checkView = (v, where) => {
      if (v === undefined) return;
      const num = (n, lo, hi) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
      if (!v || !num(v.x, -150, 150) || !num(v.y, -150, 150) || !num(v.zoom, 0.3, 4)) err(where, 'imageView 는 { x, y: -150~150, zoom: 0.3~4 }');
    };

    if (exam.id !== examId) err('', `id "${exam.id}" 가 파일 이름과 다름`);
    for (const k of ['title', 'theme', 'source']) if (!isStr(exam[k])) err('', `${k} 없음`);
    if (exam.theme && !THEMES.includes(exam.theme)) err('', `theme "${exam.theme}" 없음 (${THEMES.join('/')})`);
    if (exam.source && !['pdf', 'draft'].includes(exam.source)) err('', `source 는 pdf 또는 draft`);
    if (!exam.cover || !isStr(exam.cover.image) || !isStr(exam.cover.imageAlt) || !isStr(exam.cover.lead)) err('cover', 'image·imageAlt·lead 필요');
    useMedia(exam.cover?.image, at('표지'));
    checkView(exam.cover?.imageView, '표지');
    if (!Array.isArray(exam.caregiver?.before) || !Array.isArray(exam.caregiver?.tips)) err('caregiver', 'before·tips 목록 필요');
    if (!isStr(exam.reward?.message)) err('reward', 'message 필요');

    const phases = Array.isArray(exam.phases) ? exam.phases : [];
    const steps = Array.isArray(exam.steps) ? exam.steps : [];
    if (phases.length === 0) err('', '묶음(phases)이 없음');
    if (steps.length === 0) err('', '단계(steps)가 없음');
    if (steps.length && (steps.length < STEPS_MIN || steps.length > STEPS_MAX)) {
      warn('', `단계 ${steps.length}개 (PDF: 검사별 약 10~15쪽 → 단계 ${STEPS_MIN}~${STEPS_MAX}개)`);
    }

    const phaseIds = new Set();
    for (const p of phases) {
      if (!isStr(p.id) || !isStr(p.title) || !isStr(p.sticker)) err(`묶음 ${p.id ?? '?'}`, 'id·title·sticker 필요');
      if (phaseIds.has(p.id)) err(`묶음 ${p.id}`, 'id 가 겹침');
      phaseIds.add(p.id);
      useMedia(p.sticker, at(`스티커 ${p.id}`), '그림');
      if (p.illustration) useMedia(p.illustration, at(`순서 그림 ${p.id}`), '그림');
      if (!steps.some((s) => s.phase === p.id)) err(`묶음 ${p.id}`, '이 묶음에 단계가 하나도 없음');
    }

    const stepIds = new Set();
    const texts = [];
    steps.forEach((s, i) => {
      const where = `${i + 1}단계(${s.id ?? '?'})`;
      if (!isStr(s.id)) err(where, 'id 없음');
      else if (stepIds.has(s.id)) err(where, 'id 가 겹침');
      stepIds.add(s.id);
      if (!phaseIds.has(s.phase)) err(where, `없는 묶음 "${s.phase}"`);
      if (!isStr(s.text)) err(where, 'text(행동 문장) 없음');
      if (!isStr(s.imageAlt)) err(where, 'imageAlt(사진 설명) 없음 — 화면 읽기용');
      if (s.image) useMedia(s.image, at(where));
      else warn(where, 'image 없음 → "사진 준비 중" 자리로 보임');
      checkView(s.imageView, where);
      if (s.audio) useMedia(s.audio, at(`${where} 읽어 주기`), '음원');
      texts.push([where, s.text], [where, s.sub], [where, s.speech], [where, s.caregiverTip]);

      for (const [j, sense] of (s.sensory ?? []).entries()) {
        if (!SENSES.includes(sense.kind)) err(where, `감각 종류 "${sense.kind}" 없음 (${SENSES.join('/')})`);
        if (!isStr(sense.text)) err(where, '감각 안내 문장 없음');
        texts.push([`${where} 감각`, sense.text]);
        if (sense.sound) {
          if (!isStr(sense.sound.label)) err(where, `감각 ${j + 1}: 소리 버튼 이름(label) 없음`);
          if (sense.sound.synth && !SYNTHS.includes(sense.sound.synth)) err(where, `효과음 이름 "${sense.sound.synth}" 없음`);
          if (sense.sound.file) useMedia(sense.sound.file, at(`${where} 감각 소리`), '음원');
          else if (!sense.sound.synth) err(where, `감각 ${j + 1}: 소리 file 이나 synth 가 필요`);
        }
      }

      if (s.practice) {
        const need = PRACTICES[s.practice.type];
        if (!need) err(where, `연습 종류 "${s.practice.type}" 가 아직 없음 (있는 것: ${Object.keys(PRACTICES).join(', ')})`);
        else for (const k of need) if (s.practice[k] === undefined) err(where, `연습 ${s.practice.type}: ${k} 필요`);
        for (const k of ['prompt', 'success']) if (s.practice[k]) texts.push([`${where} 연습`, s.practice[k]]);
        if (s.practice.type === 'tapArea' && s.practice.target && !BODY_PARTS.includes(s.practice.target)) {
          err(where, `몸 부위 "${s.practice.target}" 없음 (${BODY_PARTS.join('/')})`);
        }
        if (s.practice.type === 'hold') {
          if (!(s.practice.seconds >= SEC.min && s.practice.seconds <= SEC.max)) err(where, `연습 hold: seconds 는 ${SEC.min}~${SEC.max}`);
          if (s.practice.figure && s.practice.figure !== 'arm') err(where, `연습 hold: figure "${s.practice.figure}" 없음 (arm)`);
          if (s.practice.photo && s.practice.photo !== 'chest') err(where, `연습 hold: photo "${s.practice.photo}" 없음 (chest)`);
        }
        if (s.practice.type === 'lookAway') {
          if (!(s.practice.seconds >= SEC.min && s.practice.seconds <= SEC.max)) err(where, `연습 lookAway: seconds 는 ${SEC.min}~${SEC.max}`);
          const list = Array.isArray(s.practice.choices) ? s.practice.choices : [];
          if (list.length < 2 || list.length > 4) err(where, '연습 lookAway: choices 는 2~4개');
          for (const c of list) {
            if (!isStr(c?.label)) err(where, '연습 lookAway: 고를 것 이름(label) 없음');
            else texts.push([`${where} 볼 곳`, c.label]);
            if (c?.image) useMedia(c.image, at(`${where} 볼 곳 그림`), '그림');
            else if (!ICONS.includes(c?.icon)) err(where, `연습 lookAway: "${c?.label}"에 그림(image)이나 아이콘(icon: ${ICONS.join('/')})이 필요`);
          }
        }
        if (s.practice.type === 'sequence') {
          const list = Array.isArray(s.practice.items) ? s.practice.items : [];
          if (list.length < 2 || list.length > 6) err(where, '연습 sequence: items 는 2~6개');
          for (const it of list) {
            if (!isStr(it?.label)) err(where, '연습 sequence: 카드 이름(label) 없음');
            if (it?.kind && !SENSES.includes(it.kind)) err(where, `연습 sequence: 카드 그림 "${it.kind}" 없음`);
            texts.push([`${where} 순서 카드`, it?.label]);
          }
          if (new Set(list.map((it) => it?.label)).size !== list.length) err(where, '연습 sequence: 카드 이름이 겹침');
        }
        if (s.practice.type === 'breathe' && !(s.practice.count >= CNT.min && s.practice.count <= CNT.max)) {
          err(where, `연습 breathe: count 는 ${CNT.min}~${CNT.max}`);
        }
        if (s.practice.type === 'placePads') {
          const list = Array.isArray(s.practice.spots) ? s.practice.spots : [];
          if (list.length === 0) err(where, '연습 placePads: spots(붙일 자리)가 비었음');
          for (const sp of list) if (!PAD_SPOTS.includes(sp)) err(where, `패드 자리 "${sp}" 없음 (${PAD_SPOTS.join('/')})`);
          if (new Set(list).size !== list.length) err(where, '패드 자리가 겹침');
          const pre = s.practice.prePlaced ?? [];
          if (!Array.isArray(pre)) err(where, '연습 placePads: prePlaced 는 자리 목록');
          else for (const sp of pre) {
            if (!PAD_SPOTS.includes(sp)) err(where, `이미 붙은 패드 자리 "${sp}" 없음 (${PAD_SPOTS.join('/')})`);
            if (list.includes(sp)) err(where, `"${sp}"가 붙일 자리와 이미 붙은 자리에 둘 다 있음`);
          }
        }
        const feel = s.practice.feel;
        if (feel) {
          if (!isStr(feel.text)) err(where, '연습 feel: 느낌 문장(text) 필요');
          texts.push([`${where} 느낌`, feel.text]);
          if (feel.sound?.synth && !SYNTHS.includes(feel.sound.synth)) err(where, `효과음 이름 "${feel.sound.synth}" 없음`);
          if (feel.sound?.file) useMedia(feel.sound.file, at(`${where} 느낌 소리`), '음원');
        }
      }
    });
    for (const t of exam.caregiver?.before ?? []) texts.push(['보호자 안내', t]);
    for (const t of exam.caregiver?.tips ?? []) texts.push(['보호자 팁', t]);
    texts.push(['칭찬', exam.reward?.message], ['표지', exam.cover?.lead]);

    for (const [where, text] of texts) {
      if (!isStr(text)) continue;
      for (const why of textProblems(text)) err(where, `"${text}" — ${why}`);
    }

    summary.push({ examId, steps: steps.length, note: exam.source === 'pdf' ? 'PDF 원문' : '우리 초안 (병원 검토 전)' });
  }

  // ---- 자료 준비 상태 ----
  // 병원 파일(media/)과 공통 그림(src/renderer/public/content/)을 나눠 셈 → "병원 사진이 준비됐다"로 잘못 읽히지 않게
  const hospitalSet = new Set(media.hospitalFiles);
  const ready = [];
  const tempList = [];
  const missing = [];
  let common = 0;
  for (const [path, info] of [...used.entries()].sort()) {
    if (!files.has(path)) missing.push({ path, ...info });
    else if (!hospitalSet.has(path)) common += 1;
    else if (temp.has(path)) tempList.push({ path, ...info });
    else ready.push({ path, ...info });
  }
  const unused = media.hospitalFiles.filter((f) => !used.has(f));

  if (strict) {
    for (const m of missing) errors.push(`자료 없음: media/${m.path}`);
    for (const m of tempList) errors.push(`임시 사진 그대로: media/${m.path}`);
  }

  // ---- 출력 ----
  console.log(`\n${c.bold(`■ ${config?.name ?? id}`)} ${c.gray(`hospitals/${id}`)}`);
  for (const s of summary) console.log(`  ${s.examId.padEnd(11)} 단계 ${String(s.steps).padStart(2)}  ${c.gray(s.note)}`);
  console.log(
    `  병원 사진·음원: ${c.green(`준비됨 ${ready.length}`)} · ${c.yellow(`임시 ${tempList.length}`)} · ${missing.length ? c.red(`없음 ${missing.length}`) : '없음 0'}` +
      c.gray(`  / 공통 그림 ${common}개  (임시 = 시안에서 자른 사진, 같은 이름으로 병원 사진을 넣으면 준비됨)`),
  );
  if (missing.length) {
    console.log(c.gray('  병원에서 받아 넣을 파일 (media/ 아래 경로):'));
    for (const m of missing) console.log(`    ${m.kind} ${c.bold(`media/${m.path}`)}  ${c.gray(m.where.join(', '))}`);
  }
  if (unused.length) console.log(c.gray(`  원고에서 안 쓰는 병원 파일: ${unused.join(', ')}`));
  for (const w of warnings) console.log(`  ${c.yellow('!')} ${w}`);
  for (const e of errors) console.log(`  ${c.red('✗')} ${e}`);
  totalErrors += errors.length;
}

const hospitals = only ? [only] : listHospitals();
if (hospitals.length === 0) {
  console.error(c.red('hospitals/ 에 병원 팩이 없어요'));
  process.exit(1);
}
for (const id of hospitals) {
  if (!existsSync(join(hospitalDir(id), 'hospital.json'))) {
    console.error(c.red(`✗ 병원 팩이 없어요: hospitals/${id}/hospital.json`));
    process.exit(1);
  }
  checkHospital(id);
}
console.log(totalErrors ? `\n${c.red(`오류 ${totalErrors}개`)} — 고친 뒤 다시 yarn check:content\n` : `\n${c.green('오류 없음')}\n`);
process.exit(totalErrors ? 1 : 0);
