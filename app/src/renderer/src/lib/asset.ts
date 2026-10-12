// 사진·음원 주소. 모두 content/<경로> 로 통일 (병원 파일이 있으면 그것, 없으면 공통 그림 — tools/hospital-pack.mjs)
// base './' 이므로 어느 경로에 올려도 맞게 풀림. 있는 파일 목록은 프로젝트(content/project.json)의 media
// 편집기(Electron) 안에서는 열린 프로젝트의 파일을 project://media/<경로> 로 받음 (content/project.ts mediaBase)
import { mediaBase, project } from '../content/project';

const files = new Set(project().media.files);
const temp = new Set(project().media.temp);

export function asset(path: string): string {
  return `${mediaBase()}${path}`;
}

/** ready = 병원 자료(또는 공통 그림) / temp = 시안에서 자른 임시 사진 / missing = 아직 없음 (병원 자료 대기) */
export type MediaStatus = 'ready' | 'temp' | 'missing';

export function mediaStatus(path: string | undefined): MediaStatus {
  if (!path || !files.has(path)) return 'missing';
  return temp.has(path) ? 'temp' : 'ready';
}

/** 모션 사진을 영상 파일로 받은 경우 (PDF "사진 또는 모션 사진"). GIF·움직이는 WebP는 사진과 같이 <img> */
export function isVideo(path: string | undefined): boolean {
  return !!path && /.(mp4|webm)$/i.test(path);
}

/** 파일이 있을 때만 true → 없는 음원은 요청하지 않고 로그만 남김 */
export function hasMedia(path: string | undefined): path is string {
  return !!path && files.has(path);
}
