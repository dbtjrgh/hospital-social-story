// 프리로드 (화면이 열리기 전에 도는 코드, electron-vite 가 out/preload/index.cjs 로 빌드)
// 화면(src/renderer)에 편집기 기능을 필요한 만큼만 내보냄 → window.ssApp (타입: src/renderer/src/env.d.ts)
// 웹 납품(브라우저)에는 이 파일이 없어서 window.ssApp 도 없음 → 화면은 content/project.json 을 읽고 편집 기능도 없음
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('ssApp', {
  /** 열린 프로젝트의 원고·사진 목록과 사진·소리 주소 앞부분 (project://media/) */
  getProject: () => ipcRenderer.invoke('project:get'),
  /** 되돌리기·저장 상태 */
  getEditState: () => ipcRenderer.invoke('edit:state'),
  /** 편집 적용 (사진·소리 넣기, 원고 칸 바꾸기). 성공하면 앱이 화면을 다시 띄움 */
  applyEdit: (ops: unknown[], label: string, options?: { reload?: boolean }) => ipcRenderer.invoke('edit:apply', ops, label, options),
  undo: () => ipcRenderer.invoke('edit:undo'),
  redo: () => ipcRenderer.invoke('edit:redo'),
  save: () => ipcRenderer.invoke('file:save'),
  /** 웹으로 내보내기 (저장 대화창 → zip) · 내보낸 zip 을 탐색기에서 보기 */
  exportWeb: () => ipcRenderer.invoke('file:export'),
  showExport: () => ipcRenderer.invoke('file:show-export'),
  /** 내보낸 zip 확인 (점검 + 잠깐 웹서버 → 기본 브라우저). last = 방금 내보낸 zip, 아니면 고르기 창 · 다시 열기 · 서버 끄기 */
  checkExport: (last?: boolean) => ipcRenderer.invoke('file:check-export', last),
  openCheck: () => ipcRenderer.invoke('file:check-open'),
  stopCheck: () => ipcRenderer.invoke('file:check-stop'),
  /** 메뉴 파일 → 내보낸 zip 브라우저로 확인 (Ctrl+Shift+B) */
  onCheck: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('editor:check', listener);
    return () => ipcRenderer.removeListener('editor:check', listener);
  },
  /** 메뉴 파일 → 웹으로 내보내기 (Ctrl+B) → 화면이 빠진 것을 먼저 보여 줌 */
  onExport: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('editor:export', listener);
    return () => ipcRenderer.removeListener('editor:export', listener);
  },
  /** 저장 상태가 바뀌면 (자동 저장 등) */
  onEditState: (cb: (state: unknown) => void) => {
    const listener = (_e: IpcRendererEvent, state: unknown) => cb(state);
    ipcRenderer.on('edit:state', listener);
    return () => ipcRenderer.removeListener('edit:state', listener);
  },
  /** 메뉴의 편집 모드(Ctrl+E)·미리보기(F5) */
  onMode: (cb: (mode: string) => void) => {
    const listener = (_e: IpcRendererEvent, mode: string) => cb(mode);
    ipcRenderer.on('editor:mode', listener);
    return () => ipcRenderer.removeListener('editor:mode', listener);
  },
});
