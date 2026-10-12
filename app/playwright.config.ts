// 전체 흐름 자동 점검 (CLAUDE.md 5-2: 엔진을 고치면 모든 병원을 다시 빌드해 자동 확인)
//   yarn test:e2e            → SampleHospital 납품 빌드를 띄워 폰·태블릿 크기로 점검 (Edge)
//   yarn test:safari         → 같은 점검을 아이폰·아이패드 사파리 엔진(WebKit)으로
//   HOSPITAL=<병원id> 로 다른 병원 (빌드는 yarn build <병원id> 먼저)
// 브라우저: Edge 는 PC에 있는 것을 씀 (Windows 기본 설치).
//   사파리 엔진은 PC마다 처음 한 번 `yarn playwright install webkit` 으로 받음 (약 60MB).
//   스마트 앱 컨트롤이 켜진 PC(회사 PC)에서는 Windows가 막아서 못 돌림 (CLAUDE.md 6장).
//   실제 아이폰·아이패드와 완전히 같지는 않음 → 실제 기기 확인은 따로.
import { defineConfig, devices } from '@playwright/test';

const hospital = process.env.HOSPITAL || 'SampleHospital';
const PORT = 4180;
// yarn test:safari 로 실행했거나 SAFARI=1 이면 사파리 엔진으로
const safari = process.env.npm_lifecycle_event === 'test:safari' || process.env.SAFARI === '1';

export default defineConfig({
  testDir: 'tests',
  timeout: 120_000,
  workers: 3,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    locale: 'ko-KR',
    hasTouch: true,
    trace: 'retain-on-failure',
  },
  projects: safari
    ? [
        { name: '아이폰 사파리', use: { ...devices['iPhone 13'] } }, // 390×664 (주소창 뺀 화면)
        { name: '아이패드 사파리', use: { ...devices['iPad Mini'] } }, // 768×1024
      ]
    : [
        { name: '폰', use: { channel: 'msedge', viewport: { width: 375, height: 812 } } },
        { name: '태블릿', use: { channel: 'msedge', viewport: { width: 768, height: 1024 } } },
        // 보조: 가로 태블릿 (기준은 세로형. 가로는 CSS 한 묶음으로 배치만 바꿈 — base.css "가로 화면")
        { name: '가로 태블릿', use: { channel: 'msedge', viewport: { width: 1280, height: 620 } } },
      ],
  webServer: {
    command: `node tools/hospital.mjs preview ${hospital} --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
