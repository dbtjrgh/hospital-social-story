// 태블릿↔PC 동기화에서 주고받는 메시지 모양 (CLAUDE.md 5장)
// 기기 쪽(client.ts)과 서버 플러그인(tools/devsync-plugin.ts)이 같이 씀. 서버가 화면 코드를 끌고 가지 않게 타입만 둠 (다른 import 금지).
// 진행 상태(StateMsg.state)는 서버가 들여다보지 않고 그대로 돌려보내므로 모양을 모름 → client.ts 가 StateMsg<AppState> 로 씀.

export type DeviceKind = 'pc' | 'tablet' | 'phone';

export interface DeviceInfo {
  id: string;
  name: string;
  kind: DeviceKind;
  /** 화면(뷰포트) 크기 */
  vw: number;
  vh: number;
  route: string;
  follow: boolean;
  ua: string;
}

/** 서버가 보내는 기기 목록 한 줄. ageMs = 서버 기준 마지막 신호 후 지난 시간 (기기 시계 차이와 무관) */
export interface DeviceRow extends DeviceInfo {
  ageMs: number;
}

export interface ServerInfo {
  local: string[];
  network: string[];
  qr: { url: string; svg: string }[];
}

export type CommandName = 'reload' | 'home' | 'reset';
export type EntryKind = 'error' | 'warn' | 'event' | 'command' | 'system';

/** 로그·이벤트 한 건. 기기 → 서버, 서버 → 모든 기기 모두 이 모양 */
export interface HistoryEntry {
  kind: EntryKind;
  from: string;
  name: string;
  message: string;
  route: string;
  t: number;
}

interface Sender {
  from: string;
  name: string;
}
export interface NavMsg extends Sender {
  route: string;
}
export interface StateMsg<S = unknown> extends Sender {
  /** 없고 ask 이면 "지금 상태를 알려 주세요" (막 들어온 기기) */
  state?: S;
  ask?: boolean;
}
/** x, y 는 앱 틀([data-app-frame]) 안에서의 비율 0~1 → 화면 크기가 달라도 같은 자리 */
export interface TapMsg extends Sender {
  x: number;
  y: number;
  route: string;
}
export interface CommandMsg extends Sender {
  command: CommandName;
}
/** 화면 그대로 보기: 보는 기기 → 서버. on = true 를 5초마다 다시 보내 "아직 보는 중"을 알림 */
export interface MirrorWatchMsg extends Sender {
  target: string;
  on: boolean;
}
/** 서버 → 찍히는 기기: 보는 기기 수 (0이면 녹화 멈춤). fresh = 새로 보는 기기가 생김 → 화면 전체를 다시 보냄 */
export interface MirrorControlMsg {
  watchers: number;
  fresh: boolean;
}
/** 찍히는 기기 → 서버 → 보는 기기들. events = rrweb 이벤트 묶음 JSON (이 기기 주소는 ORIGIN_TOKEN 으로 바꿔 둠).
 *  checkout = 새로 보는 기기를 위해 다시 찍은 화면 전체가 든 묶음 → 이미 보던 기기는 화면 전체만 건너뜀 (안 깜빡이게) */
export interface MirrorEventsMsg extends Sender {
  events: string;
  checkout?: boolean;
}
