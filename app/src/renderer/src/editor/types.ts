// 편집기와 앱(src/main/project.ts)이 주고받는 모양. 앱 쪽 EditOp·EditState 와 같게 맞출 것

/**
 * 편집 한 가지
 *   put    = 사진·소리 파일 넣기·바꾸기 (프로젝트 media/<path>)
 *   remove = 사진·소리 파일 빼기
 *   json   = 원고 한 칸 바꾸기 (file = hospital.json 또는 exams/<id>.json, pointer = JSON Pointer, value 가 없으면 칸을 지움)
 *   reset  = 사진을 기본 사진으로 (기본 틀의 파일·파일 이름, 배치도 처음으로)
 */
export type EditOp =
  | { kind: 'put'; path: string; bytes: Uint8Array }
  | { kind: 'remove'; path: string }
  | { kind: 'json'; file: string; pointer: string; value?: unknown }
  | { kind: 'reset'; path: string; field?: { file: string; image: string; view: string } };

/** 내보낸 zip 점검 한 줄 (src/main/webCheck.ts CheckItem 과 같게). ok = 통과, warn = 열리지만 알아 둘 것, fail = 고쳐야 함 */
export interface WebCheckItem {
  level: 'ok' | 'warn' | 'fail';
  label: string;
  detail?: string;
}

/** 내보낸 zip 확인 결과. url = 잠깐 웹서버 주소 (index.html 이 맨 위에 없으면 서버를 안 켜서 null) */
export type WebCheckResult =
  | { ok: true; file: string; url: string | null; items: WebCheckItem[]; count: number; bytes: number }
  | { ok: false; canceled?: boolean; message?: string };

export interface EditState {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  dirty: boolean;
  hasFile: boolean;
  savedAt: string | null;
  autoSaved: boolean;
}
