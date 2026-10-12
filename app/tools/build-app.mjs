// 앱 설치 파일 만들기
//   yarn build:app          → 예시 병원(SampleHospital)
//   yarn build:app <병원id> → 그 병원
// 순서: 원고 검사·타입 검사 → electron-vite build (창·프리로드·그 병원 화면 → out/) → 플레이어 틀(out/player) → electron-builder 로 설치 파일 (release/<병원id>/)
// electron-builder 설정은 electron-builder.yml
import { execSync } from 'node:child_process';
import { resolveHospital } from './hospital-pack.mjs';

let id;
try {
  id = resolveHospital(process.argv[2]);
} catch (err) {
  console.error(`✗ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
const env = { ...process.env, HOSPITAL: id };

// 1. 원고 검사 + 타입 검사 (웹 빌드 yarn build 와 같은 검사)
execSync(`node tools/check.mjs ${id}`, { stdio: 'inherit' });
execSync('yarn typecheck', { stdio: 'inherit' });

// 2. 창·프리로드·화면 빌드 → out/ (화면에는 공통 그림만, 병원 자료는 새 프로젝트의 기본 틀로 resources/template 에)
execSync('yarn electron-vite build', { stdio: 'inherit', env });
// 웹으로 내보내기에 쓸 플레이어 틀 → out/player (편집기 코드 없음, tools/build-player.mjs)
execSync('node tools/build-player.mjs', { stdio: 'inherit', env });

// 3. 설치 파일 만들기
// 가끔 처음 한 번 실패하고 바로 다시 하면 되는 일이 있었음 (2026-10-08, 원인 미확인 — 앞서 만든 release 파일을 백신 등이 잡고 있는 것으로 보임)
// → 실패하면 3초 뒤 한 번 더. 두 번째도 실패하면 멈춤 (위에 electron-builder 오류가 그대로 보임)
const builder = `yarn electron-builder --win -c.directories.output=release/${id} -c.nsis.artifactName=social-story-${id}-\${version}-setup.\${ext}`;
try {
  execSync(builder, { stdio: 'inherit', env });
} catch {
  console.warn('\n[build:app] 설치 파일 만들기가 한 번 실패했어요. 3초 뒤 다시 해 볼게요 (위 오류 내용을 Claude 에게 보여 주세요).\n');
  execSync(process.platform === 'win32' ? 'timeout /t 3 /nobreak > nul' : 'sleep 3', { stdio: 'ignore', shell: true });
  execSync(builder, { stdio: 'inherit', env });
}

console.log(`\n완료: release/${id} 폴더의 설치 파일(social-story-${id}-...-setup.exe)을 태블릿에서 실행하세요.`);
