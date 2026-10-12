// 새 병원 팩 만들기: 이미 있는 병원의 원고(JSON)만 복사하고, 사진·음원은 비워 둠 (다른 병원 사진이 섞이지 않게)
//   yarn new-hospital <병원id> "<병원 이름>" [--from SampleHospital]
// 만든 뒤 yarn check:content <병원id> → 그 병원에서 받아 넣을 파일 목록이 나옴
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_HOSPITAL, hospitalDir, resolveHospital } from './hospital-pack.mjs';

const args = process.argv.slice(2);
const fromAt = args.indexOf('--from');
const from = fromAt >= 0 ? args.splice(fromAt, 2)[1] : DEFAULT_HOSPITAL;
const [id, name] = args;

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!id || !name) fail('사용법: yarn new-hospital <병원id> "<병원 이름>" [--from SampleHospital]');
// 폴더 이름은 영어로 (CLAUDE.md 0장). 주소·저장 키에도 들어감. 대문자도 됨 (SampleHospital, 2026-10-07)
if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(id)) fail(`병원 id는 영어·숫자·- 만 써 주세요: ${id}`);
const dir = hospitalDir(id);
if (existsSync(dir)) fail(`이미 있어요: hospitals/${id}/`);
try {
  resolveHospital(from);
} catch (err) {
  fail(err.message);
}

const src = hospitalDir(from);
const config = JSON.parse(readFileSync(join(src, 'hospital.json'), 'utf8'));
mkdirSync(join(dir, 'media'), { recursive: true });
cpSync(join(src, 'exams'), join(dir, 'exams'), { recursive: true });
writeFileSync(join(dir, 'hospital.json'), `${JSON.stringify({ ...config, id, name }, null, 2)}\n`);
writeFileSync(join(dir, 'media', '.gitkeep'), '');

console.log(`✓ hospitals/${id}/ 만듦 (${from} 원고 복사, 사진·음원은 비어 있음)`);
console.log(`  다음: hospital.json 의 검사 목록 확인 → yarn check:content ${id} → yarn dev ${id}`);
