// 병원을 골라 Vite 실행 (package.json 의 dev:web / build / preview, tools/dev-app.mjs 가 이 파일을 부름)
//   yarn dev:web            → 기본 병원(SampleHospital) 개발 서버 (yarn dev 는 tools/dev-app.mjs 가 이걸 켜고 Electron 창을 띄움)
//   yarn dev:web <병원id> → 그 병원으로
//   yarn build <병원id>   → dist/<병원id>/ 에 그 병원 자료만 (기본 SampleHospital)
//   yarn build all        → 모든 병원을 하나씩
//   yarn preview <병원id> → 빌드 결과 확인
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { listHospitals, resolveHospital, ROOT } from './hospital-pack.mjs';

const [command = 'dev', first, ...rest] = process.argv.slice(2);
const hasId = first !== undefined && !first.startsWith('-');
const viteArgs = hasId ? rest : [first, ...rest].filter((a) => a !== undefined);

let ids;
try {
  if (hasId && first === 'all') {
    if (command !== 'build') throw new Error('all 은 build 에서만 쓸 수 있어요');
    ids = listHospitals();
  } else {
    ids = [resolveHospital(hasId ? first : undefined)];
  }
} catch (err) {
  console.error(`✗ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
for (const id of ids) {
  if (ids.length > 1) console.log(`\n── ${id} ──`);
  const args = command === 'dev' ? [viteBin, ...viteArgs] : [viteBin, command, ...viteArgs];
  const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, HOSPITAL: id } });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
