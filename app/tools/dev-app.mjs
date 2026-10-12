// 개발 모드: electron-vite dev = 화면 개발 서버 + Electron 창 (package.json 의 dev 가 이 파일을 부름)
//   yarn dev            → 예시 병원(SampleHospital)
//   yarn dev <병원id>   → 그 병원
// 코드를 저장하면 창이 바로 바뀜 (창 코드 src/main 을 고치면 창이 다시 뜸). F12 = 개발자 도구, Ctrl+Shift+L = 로그 폴더 (src/main/index.ts)
// 태블릿·브라우저 접속도 지금처럼 됨 (같은 5180 포트). 브라우저로만 보려면 yarn dev:web
// 창을 닫으면 개발 서버도 꺼짐.
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { resolveHospital, ROOT } from './hospital-pack.mjs';

const PORT = 5180; // tools/renderer-config.ts 의 DEV_PORT 와 같게

/** 그 포트에 이미 개발 서버가 떠 있는지 */
function portBusy() {
  return new Promise((done) => {
    const socket = createConnection({ host: '127.0.0.1', port: PORT });
    socket.once('connect', () => {
      socket.destroy();
      done(true);
    });
    socket.once('error', () => done(false));
  });
}

let hospital;
try {
  hospital = resolveHospital(process.argv[2]);
} catch (err) {
  console.error(`✗ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

const env = { ...process.env, HOSPITAL: hospital };
// 이미 켜진 개발 서버가 있으면 그걸 씀 (예: yarn dev:web 을 켜 둔 채로 창만 띄우기) → 화면 개발 서버를 또 켜지 않음
if (await portBusy()) {
  console.log(`[개발] ${PORT} 포트에 이미 켜진 개발 서버가 있어요 → 창만 띄워요. (electron-vite 의 "renderer config is missing" 은 이 때문이라 괜찮음)`);
  env.SOCIAL_STORY_DEV_URL = `http://localhost:${PORT}`;
}

const bin = join(ROOT, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js');
const dev = spawn(process.execPath, [bin, 'dev'], { cwd: ROOT, stdio: 'inherit', env });
dev.on('exit', (code) => process.exit(code ?? 0));
