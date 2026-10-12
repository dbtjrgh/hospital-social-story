// 웹 납품용 Vite 설정 (yarn dev:web · build · preview, tools/hospital.mjs 가 부름) → dist/<병원id>/
// 화면 설정은 tools/renderer-config.ts 에서 Electron 앱(electron.vite.config.ts)과 같이 씀
import { join } from 'node:path';
import { defineConfig, mergeConfig } from 'vite';
import { resolveHospital, ROOT } from './tools/hospital-pack.mjs';
import { rendererConfig } from './tools/renderer-config.ts';

const hospital = resolveHospital();

// 개발 서버(yarn dev:web)에는 편집기 코드도 넣음 → 이미 켜진 개발 서버에 앱 창만 붙여도 편집기가 됨 (tools/dev-app.mjs)
export default defineConfig(({ command }) =>
  mergeConfig(rendererConfig(hospital, { editor: command === 'serve' }), {
    preview: { host: true, port: 4173 },
    build: { outDir: join(ROOT, 'dist', hospital) },
  }),
);
