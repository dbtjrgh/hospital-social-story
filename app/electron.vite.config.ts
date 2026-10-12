// Electron 앱 설정 (electron-vite): src/main(창) · src/preload · src/renderer(화면) → out/
//   yarn dev       → tools/dev-app.mjs 가 병원(HOSPITAL)을 정해 electron-vite dev 실행
//   yarn build:app → tools/build-app.mjs 가 electron-vite build 뒤 electron-builder 로 설치 파일
// 화면 설정은 tools/renderer-config.ts 에서 웹 납품(vite.config.ts)과 같이 씀
import { defineConfig } from 'electron-vite';
import { resolveHospital } from './tools/hospital-pack.mjs';
import { rendererConfig } from './tools/renderer-config.ts';

const hospital = resolveHospital();
// 이미 켜진 개발 서버에 창만 붙일 때(tools/dev-app.mjs) → 화면 개발 서버를 따로 켜지 않음
const windowOnly = !!process.env.SOCIAL_STORY_DEV_URL;

export default defineConfig({
  main: {},
  preload: {
    // 창의 기본 보안(sandbox)을 켠 채로 쓰려면 프리로드는 CommonJS 여야 함 (package.json 이 "type": "module" 이라 .cjs)
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
  // 화면 빌드에는 공통 그림만 (병원 원고·사진은 열린 프로젝트 .ssproj 에서 옴)
  ...(!windowOnly && { renderer: rendererConfig(hospital, { forApp: true }) }),
});
