// 웹 결과물의 틀(플레이어) 만들기 → out/player (CLAUDE.md 1-c ⑤단계)
//   편집기 "파일 → 웹으로 내보내기"가 이 파일들 + 프로젝트 원고·사진·소리를 zip 하나로 묶음 (src/main/exportWeb.ts)
//   편집기 코드 없음(__EDITOR__ false), 병원 원고·사진 없음(공통 그림만) → 내용은 내보낼 때 프로젝트에서
// yarn build:app · yarn app 이 electron-vite build 다음에 부름 (electron-vite 는 out/main·preload·renderer 만 비우므로 out/player 는 남음)
// 개발 창(yarn dev)에서 내보내기를 해 보려면 한 번: yarn build:player
import { join } from 'node:path';
import { build, mergeConfig } from 'vite';
import { resolveHospital, ROOT } from './hospital-pack.mjs';
import { rendererConfig } from './renderer-config.ts';

const outDir = join(ROOT, 'out', 'player');
await build(
  mergeConfig(rendererConfig(resolveHospital(), { forApp: true, editor: false }), {
    configFile: false,
    logLevel: 'warn',
    build: { outDir },
  }),
);
console.log(`[build:player] 웹 결과물 틀 → ${outDir}`);
