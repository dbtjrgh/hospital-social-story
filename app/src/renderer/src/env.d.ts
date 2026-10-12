/// <reference types="vite/client" />
// 화면 코드의 타입 선언 (electron-vite 템플릿과 같은 이름)
// 병원 원고·사진 목록은 빌드에 묶지 않고 실행할 때 읽음 (content/project.ts)

import type { ProjectData } from './content/project';
import type { EditOp, EditState, WebCheckResult } from './editor/types';

declare global {
  /** 편집기 코드를 넣은 빌드인지 (앱 빌드·개발 서버만 true, 웹 납품은 false — tools/renderer-config.ts) */
  const __EDITOR__: boolean;

  interface Window {
    /** 편집기: 고치는 중인 글 칸을 앱에 보냄 (앱이 저장·내보내기·닫기 전에 부름 — editor/editorState.ts) */
    __edFlush?: () => Promise<void>;
    /** 편집기(Electron 앱) 안에서만 있음 — src/preload/index.ts. 웹 납품(브라우저)에서는 없음 */
    ssApp?: {
      /** 열린 프로젝트. mediaBase = 사진·소리 주소 앞부분 (project://media/) */
      getProject(): Promise<{ data: ProjectData; mediaBase: string }>;
      getEditState(): Promise<EditState>;
      /** 성공하면 앱이 화면을 다시 띄움 (reload: false = 안 띄움 — 화면이 읽어 둔 원고를 스스로 고침) */
      applyEdit(ops: EditOp[], label: string, options?: { reload?: boolean }): Promise<{ ok: true } | { ok: false; message: string }>;
      undo(): Promise<void>;
      redo(): Promise<void>;
      save(): Promise<boolean>;
      onEditState(cb: (state: EditState) => void): () => void;
      onMode(cb: (mode: string) => void): () => void;
      /** 웹으로 내보내기: 저장 대화창 → zip 하나 (src/main/exportWeb.ts). canceled = 대화창에서 취소 */
      exportWeb(): Promise<{ ok: true; file: string; bytes: number; count: number } | { ok: false; canceled?: boolean; message?: string }>;
      /** 방금 내보낸 zip 을 탐색기에서 보여 줌 */
      showExport(): Promise<void>;
      /** 메뉴 파일 → 웹으로 내보내기 (Ctrl+B) */
      onExport(cb: () => void): () => void;
      /** 내보낸 zip 확인: 점검 + 앱이 잠깐 웹서버(127.0.0.1)가 되어 기본 브라우저로 엶 (src/main/webCheck.ts). last = 방금 내보낸 zip */
      checkExport(last?: boolean): Promise<WebCheckResult>;
      /** 켜져 있는 확인 서버 주소를 브라우저로 다시 열기 · 서버 끄기 */
      openCheck(): Promise<void>;
      stopCheck(): Promise<void>;
      /** 메뉴 파일 → 내보낸 zip 브라우저로 확인 (Ctrl+Shift+B) */
      onCheck(cb: () => void): () => void;
    };
  }
}
