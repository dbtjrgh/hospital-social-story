// 화면(renderer) Vite 설정 — 웹 납품(vite.config.ts)과 Electron 앱(electron.vite.config.ts)이 같이 씀.
// 한쪽만 고치면 웹과 앱 화면이 달라지므로 여기서만 고칠 것.
//
// base './' + 해시 라우팅 → 어느 경로에 올려도 동작 (file:// 더블클릭은 지원 안 함 — CLAUDE.md 2장)
// 병원 팩: 환경 변수 HOSPITAL(기본 SampleHospital)의 원고·사진만 씀. tools/hospital.mjs·dev-app.mjs 가 정해 줌 — CLAUDE.md 5-2장
//   원고·사진 목록은 content/project.json, 사진·음원은 content/<경로> — 둘 다 hospitalPack 이 줌 (실행할 때 읽음)
// devSync: 태블릿↔PC 동기화 (apply: 'serve' → 개발 서버에서만, 빌드에는 없음) — CLAUDE.md 5장
import { join } from 'node:path';
import react from '@vitejs/plugin-react';
import type { UserConfig } from 'vite';
import { devSync } from './devsync-plugin.ts';
import { hospitalPack, ROOT } from './hospital-pack.mjs';

export const DEV_PORT = 5180;

/**
 * forApp = 편집기(Electron) 화면 빌드: 병원 사진·project.json 을 빌드에 넣지 않음 (열린 프로젝트에서 받음)
 * editor = 편집기 코드를 넣을지 (__EDITOR__). 앱 빌드와 개발 서버만 → 웹 납품 빌드에는 편집기 코드 조각 파일도 없음
 */
export function rendererConfig(hospital: string, { forApp = false, editor = forApp }: { forApp?: boolean; editor?: boolean } = {}): UserConfig {
  return {
    define: { __EDITOR__: JSON.stringify(editor) },
    // 화면 루트. 공통 그림은 Vite 기본 위치 그대로 src/renderer/public/ (content/common·sounds)
    root: join(ROOT, 'src', 'renderer'),
    base: './',
    plugins: [react(), hospitalPack(hospital, { withContent: !forApp }), devSync()],
    server: { host: true, port: DEV_PORT },
    // rrweb(화면 그대로 보기, 개발 전용)는 처음 쓸 때 불러옴 → 미리 묶어 두지 않으면 그때 Vite 가 화면을 새로고침함
    optimizeDeps: { include: ['rrweb'] },
    // minify: electron-vite 는 화면을 기본으로 압축하지 않음 → 웹과 앱이 같은 결과가 되게 직접 켬
    // chunkSizeWarningLimit: 한 화면 앱이라 일부러 한 묶음(약 580KB) → 크기 경고만 끔
    build: { emptyOutDir: true, assetsInlineLimit: 0, minify: 'esbuild', chunkSizeWarningLimit: 1000 },
  };
}
