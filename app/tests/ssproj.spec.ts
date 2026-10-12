// .ssproj 자체 포맷·프로젝트 저장/열기 점검 (CLAUDE.md 1-c ②단계). Electron 없이 Node 만으로 돎.
// 브라우저 화면 크기와 상관없으므로 첫 번째 크기(프로젝트)에서만 한 번 돌림
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { readSsproj, SsprojError, writeSsproj } from '../src/main/ssproj';
import { ProjectSession } from '../src/main/project';

const TEMPLATE = join(process.cwd(), '..', 'hospitals', process.env.HOSPITAL || 'SampleHospital');
const COMMON = join(process.cwd(), 'src', 'renderer', 'public', 'content');

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== info.config.projects[0].name, '브라우저와 상관없는 점검이라 한 번만');
});

let tmp = '';
test.beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'ssproj-test-'));
});
test.afterEach(() => {
  // 건너뛴 크기에서는 임시 폴더를 만들지 않음
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = '';
});

function sampleFolder(): string {
  const dir = join(tmp, 'src');
  mkdirSync(join(dir, 'exams'), { recursive: true });
  mkdirSync(join(dir, 'media', 'xray'), { recursive: true });
  writeFileSync(join(dir, 'hospital.json'), JSON.stringify({ id: 'Test', name: '비밀 문장 병원', exams: ['xray'] }));
  writeFileSync(join(dir, 'exams', 'xray.json'), JSON.stringify({ id: 'xray', text: '기계 앞에 똑바로 서요' }));
  writeFileSync(join(dir, 'media', 'xray', 'photo.jpg'), randomBytes(50_000));
  return dir;
}

async function readError(file: string): Promise<SsprojError> {
  try {
    await readSsproj(file, join(tmp, `out-${Math.random()}`));
  } catch (err) {
    expect(err).toBeInstanceOf(SsprojError);
    return err as SsprojError;
  }
  throw new Error('열리면 안 되는데 열렸어요');
}

test('.ssproj: 저장한 그대로 다시 풀림 (원고·사진 바이트 같음)', async () => {
  const src = sampleFolder();
  const file = join(tmp, 'a.ssproj');
  await writeSsproj(src, file);
  const out = join(tmp, 'out');
  await readSsproj(file, out);
  for (const p of ['hospital.json', 'exams/xray.json', 'media/xray/photo.jpg']) {
    expect(readFileSync(join(out, p)).equals(readFileSync(join(src, p))), p).toBe(true);
  }
});

test('.ssproj: zip 이 아니고, 안의 글자가 그대로 보이지 않음 (일반 압축 프로그램으로 안 열림)', async () => {
  const src = sampleFolder();
  const file = join(tmp, 'a.ssproj');
  await writeSsproj(src, file);
  const bytes = readFileSync(file);
  expect(bytes.subarray(0, 4).toString('ascii')).toBe('SSPJ');
  expect(bytes.includes(Buffer.from('PK\x03\x04', 'binary'))).toBe(false); // zip 표식 없음
  expect(bytes.includes(Buffer.from('비밀 문장 병원'))).toBe(false); // 암호화
  expect(bytes.includes(Buffer.from('hospital.json'))).toBe(false); // 파일 목록도 암호화
});

test('.ssproj: 한 바이트만 고쳐도 "망가졌어요", 다른 파일은 "프로젝트 파일이 아니에요"', async () => {
  const src = sampleFolder();
  const file = join(tmp, 'a.ssproj');
  await writeSsproj(src, file);
  const bytes = readFileSync(file);
  bytes[200] ^= 0xff; // 첫 파일 내용 한가운데
  writeFileSync(file, bytes);
  expect((await readError(file)).kind).toBe('damaged');

  const zip = join(tmp, 'b.ssproj');
  writeFileSync(zip, Buffer.concat([Buffer.from('PK\x03\x04', 'binary'), randomBytes(100)]));
  expect((await readError(zip)).kind).toBe('not-ssproj');
});

test('.ssproj: 다시 저장하면 직전 파일을 .bak 으로 남기고, 임시 파일은 안 남음', async () => {
  const src = sampleFolder();
  const file = join(tmp, 'a.ssproj');
  await writeSsproj(src, file);
  const first = readFileSync(file);
  writeFileSync(join(src, 'exams', 'xray.json'), JSON.stringify({ id: 'xray', text: '바뀐 문장' }));
  await writeSsproj(src, file);
  expect(readFileSync(`${file}.bak`).equals(first)).toBe(true);
  expect(existsSync(`${file}.tmp`)).toBe(false);
});

test('프로젝트: 새로 만들기(기본 틀) → 저장 → 다른 세션에서 열기 → 같은 원고·사진 목록', async () => {
  const paths = { workRoot: join(tmp, 'work'), templateDir: TEMPLATE, commonDir: COMMON, appVersion: 'test' };
  const a = new ProjectSession(paths);
  await a.newProject();
  expect(a.filePath).toBeNull();
  expect(a.displayName).toBe('새 프로젝트');
  const data = await a.projectData();
  const hospital = JSON.parse(readFileSync(join(TEMPLATE, 'hospital.json'), 'utf8'));
  expect(data.hospital.id).toBe(hospital.id);
  expect(data.exams.length).toBeGreaterThan(0);
  expect(data.media.files).toContain('common/sticker-star.png'); // 공통 그림
  expect(data.media.temp.length).toBeGreaterThan(0); // 기본 틀의 임시 사진 표시 유지

  const file = join(tmp, '서울 병원.ssproj');
  await a.save(file);
  expect(a.displayName).toBe('서울 병원');

  const b = new ProjectSession({ ...paths, workRoot: join(tmp, 'work2') });
  await b.open(file);
  expect(await b.projectData()).toEqual(data);
  expect(existsSync(join(b.workDir, 'manifest.json'))).toBe(true);

  // 사진 주소: 프로젝트 사진 → 없으면 공통 그림, 폴더 밖·숨김 파일은 안 줌
  expect(b.resolveMedia('common/sticker-star.png')).toBe(join(COMMON, 'common', 'sticker-star.png'));
  expect(b.resolveMedia('../hospital.json')).toBeNull();
  expect(b.resolveMedia('_temp.json')).toBeNull();
});

test('프로젝트: 망가진 파일을 열려고 하면 지금 프로젝트는 그대로', async () => {
  const paths = { workRoot: join(tmp, 'work'), templateDir: TEMPLATE, commonDir: COMMON, appVersion: 'test' };
  const s = new ProjectSession(paths);
  await s.newProject();
  const before = s.workDir;
  const bad = join(tmp, 'bad.ssproj');
  writeFileSync(bad, randomBytes(300));
  await expect(s.open(bad)).rejects.toThrow('프로젝트 파일(.ssproj)이 아니에요');
  expect(s.workDir).toBe(before);
  expect(existsSync(join(before, 'hospital.json'))).toBe(true);
});

test('편집: 사진 넣기·원고 칸 바꾸기 = 되돌리기 한 칸, 되돌리면 저장한 상태로 (저장 안 함 표시도)', async () => {
  const paths = { workRoot: join(tmp, 'work'), templateDir: TEMPLATE, commonDir: COMMON, appVersion: 'test' };
  const s = new ProjectSession(paths);
  await s.newProject();
  const file = join(tmp, 'edit.ssproj');
  await s.save(file);
  expect(s.dirty).toBe(false);

  // 첫 단계 사진이 실제로 있는(임시 사진) 검사로
  const start = await s.projectData();
  type E = { id: string; steps: { image: string; audio?: string }[] };
  const exam = (start.exams as E[]).find((e) => start.media.temp.includes(e.steps[0].image))!;
  expect(exam, "임시 사진이 있는 검사").toBeTruthy();
  const examNow = async () => ((await s.projectData()).exams as E[]).find((e) => e.id === exam.id)!;
  const photo = exam.steps[0].image;
  const before = readFileSync(join(s.workDir, 'media', ...photo.split('/')));
  const bytes = randomBytes(1000);
  await s.apply(
    [
      { kind: 'put', path: photo, bytes },
      { kind: 'put', path: `voice/${exam.id}/s1.mp3`, bytes: randomBytes(10) },
      { kind: 'json', file: `exams/${exam.id}.json`, pointer: '/steps/0/audio', value: `voice/${exam.id}/s1.mp3` },
    ],
    '사진·음성 넣기',
  );
  expect(s.dirty).toBe(true);
  expect(s.editState()).toMatchObject({ canUndo: true, canRedo: false, undoLabel: '사진·음성 넣기' });
  expect(readFileSync(join(s.workDir, 'media', ...photo.split('/'))).equals(bytes)).toBe(true);
  expect((await examNow()).steps[0].audio).toBe(`voice/${exam.id}/s1.mp3`);
  expect((await s.projectData()).media.temp).not.toContain(photo); // 바꾼 사진은 임시 표시가 사라짐

  await s.undo();
  expect(s.dirty).toBe(false);
  expect(readFileSync(join(s.workDir, 'media', ...photo.split('/'))).equals(before)).toBe(true);
  expect(existsSync(join(s.workDir, 'media', 'voice'))).toBe(true); // 폴더는 남아도
  expect(existsSync(join(s.workDir, 'media', 'voice', exam.id, 's1.mp3'))).toBe(false); // 파일은 없어짐
  expect((await examNow()).steps[0].audio).toBeUndefined();

  await s.redo();
  expect(s.dirty).toBe(true);
  expect(readFileSync(join(s.workDir, 'media', ...photo.split('/'))).equals(bytes)).toBe(true);

  // 폴더 밖·원고가 아닌 파일은 안 됨 (하나라도 틀리면 아무것도 안 바뀜)
  await expect(s.apply([{ kind: 'put', path: '../hospital.json', bytes }], 'x')).rejects.toThrow();
  await expect(s.apply([{ kind: 'json', file: 'manifest.json', pointer: '/a', value: 1 }], 'x')).rejects.toThrow();
  expect(s.editState().undoLabel).toBe('사진·음성 넣기');
});

test('편집: 영상으로 바꾼 자리도 "기본 사진으로" 하면 원래 이름·기본 사진·배치 처음으로', async () => {
  const paths = { workRoot: join(tmp, 'work'), templateDir: TEMPLATE, commonDir: COMMON, appVersion: 'test' };
  const s = new ProjectSession(paths);
  await s.newProject();
  const start = await s.projectData();
  type E = { id: string; steps: { image: string; imageView?: unknown }[] };
  const exam = (start.exams as E[]).find((e) => start.media.temp.includes(e.steps[0].image))!;
  const photo = exam.steps[0].image;
  const video = photo.replace(/\.[a-z]+$/, '.mp4');
  const file = `exams/${exam.id}.json`;
  const field = { file, image: '/steps/0/image', view: '/steps/0/imageView' };
  const original = readFileSync(join(TEMPLATE, 'media', ...photo.split('/')));

  // 영상으로 바꾸고 배치도 저장
  await s.apply(
    [
      { kind: 'put', path: video, bytes: randomBytes(500) },
      { kind: 'remove', path: photo },
      { kind: 'json', file, pointer: field.image, value: video },
      { kind: 'json', file, pointer: field.view, value: { x: 10, y: -5, zoom: 1.4 } },
    ],
    '영상 넣기',
  );
  const now = async () => ((await s.projectData()).exams as E[]).find((e) => e.id === exam.id)!.steps[0];
  expect(await now()).toMatchObject({ image: video, imageView: { x: 10, y: -5, zoom: 1.4 } });

  await s.apply([{ kind: 'reset', path: video, field }], '기본 사진으로');
  const step = await now();
  expect(step.image).toBe(photo);
  expect(step.imageView).toBeUndefined();
  expect(readFileSync(join(s.workDir, 'media', ...photo.split('/'))).equals(original)).toBe(true);
  expect(existsSync(join(s.workDir, 'media', ...video.split('/')))).toBe(false);
  expect((await s.projectData()).media.temp).toContain(photo); // 기본 틀의 임시 사진 표시도 돌아옴

  // 한 번에 되돌리면 다시 영상
  await s.undo();
  expect((await now()).image).toBe(video);
});
