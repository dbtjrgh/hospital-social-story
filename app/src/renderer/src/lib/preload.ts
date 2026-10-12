// 사진 미리 받기: 검사 하나를 열면 그 검사에서 쓸 그림을 모두 받아 둠 (2026-10-06)
// → 병원 와이파이가 느리거나 중간에 끊겨도 그 검사는 끝까지 사진이 바로 뜸.
// 받은 그림을 여기 붙잡아 둬야 브라우저가 버리지 않음. 다른 검사를 열면 앞 검사 것은 놓아줌.
import { asset, isVideo } from './asset';

let kept = new Map<string, HTMLImageElement | HTMLVideoElement>();

function load(path: string): HTMLImageElement | HTMLVideoElement {
  // 영상(모션 사진)은 <img>로 받으면 못 읽고 버림 → 영상으로 미리 받음
  if (isVideo(path)) {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.src = asset(path);
    return video;
  }
  const img = new Image();
  img.fetchPriority = 'low'; // 지금 화면에 보이는 사진을 먼저 받게
  img.src = asset(path);
  return img;
}

export function keepImages(paths: string[]): void {
  const next = new Map<string, HTMLImageElement | HTMLVideoElement>();
  for (const path of paths) next.set(path, kept.get(path) ?? load(path));
  kept = next;
}
