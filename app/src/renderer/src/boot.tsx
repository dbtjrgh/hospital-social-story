// 화면 띄우기. main.tsx 가 프로젝트(content/project.json, 편집기는 열린 .ssproj)를 읽은 뒤에 이 파일을 불러옴
// → 이 아래 화면 코드(원고·저장·사진 목록)는 프로젝트가 있다고 믿고 씀
// 편집기(Electron 앱, window.ssApp 이 있을 때)면 편집기 틀(도구 막대·페이지 목록·사진·소리 칸)로 감쌈 (CLAUDE.md 1-c ③단계)
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

export async function boot(root: HTMLElement): Promise<void> {
  let app: ReactNode = <App />;
  if (__EDITOR__ && window.ssApp) {
    // 편집기 코드는 앱 안에서만 따로 불러옴 → 웹 납품 빌드에는 안 들어감
    const editor = await import('./editor/start');
    editor.start();
    app = <editor.EditorShell>{app}</editor.EditorShell>;
  }
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>{app}</ErrorBoundary>
    </StrictMode>,
  );

  // 태블릿↔PC 실시간 동기화 (개발 서버에서만. 납품 빌드에는 포함되지 않음)
  // glob으로 불러서, 동기화 파일이 없어도 앱은 그대로 뜸
  if (import.meta.env.DEV) {
    const devsync = import.meta.glob<{ startDevSync: () => void }>('./devsync/client.ts');
    for (const load of Object.values(devsync)) void load().then((m) => m.startDevSync());
  }
}
