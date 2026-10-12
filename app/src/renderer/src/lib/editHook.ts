// 플레이어 화면에 편집기 덧그림을 끼우는 자리. 편집기(Electron 앱)가 시작할 때만 채움 (editor/start.tsx)
// → 웹 납품 빌드에는 편집기 코드가 들어가지 않음 (편집기는 boot.tsx 가 앱 안에서만 따로 불러옴)
import { useSyncExternalStore, type ReactNode } from 'react';
import type { ImageView } from '../content/types';

// 원고를 고친 횟수: 편집기가 화면을 다시 띄우지 않고 읽어 둔 원고를 고치면 올림 → 페이지를 새로 그림 (App.tsx).
// 연출 캔버스(FxLayer)는 그대로 둠 (새로 붙이면 Pixi 가 이미 지운 그림을 건드려 화면이 멈췄음). 웹에서는 늘 0
let contentVersion = 0;
const versionListeners = new Set<() => void>();

export function bumpContentVersion(): void {
  contentVersion += 1;
  versionListeners.forEach((l) => l());
}

export function useContentVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      versionListeners.add(cb);
      return () => versionListeners.delete(cb);
    },
    () => contentVersion,
  );
}

/** 원고에서 이 사진이 적힌 칸 (편집기가 영상으로 바꾸거나 배치를 저장할 때). 첫 화면 카드처럼 칸이 없으면 없음 */
export interface MediaField {
  /** exams/<검사>.json */
  file: string;
  /** 사진 파일 이름 칸 (JSON Pointer, 예: /steps/3/image) */
  image: string;
  /** 배치 칸 (예: /steps/3/imageView) */
  view: string;
}

export interface PhotoEditProps {
  path: string;
  /** 원고에 저장된 배치 */
  view?: ImageView;
  field?: MediaField;
  /** 조정하는 동안 바로 보여 줄 배치 (null = 원고 값으로) */
  setLive: (view: ImageView | null) => void;
}

type PhotoEditRender = (props: PhotoEditProps) => ReactNode;
let photoEditRender: PhotoEditRender | null = null;

export function setPhotoEdit(render: PhotoEditRender): void {
  photoEditRender = render;
}

/** 사진 위 "사진 바꾸기·배치 조정" 덧그림 (편집 모드에서만 보임). 편집기가 아니면 아무것도 없음 */
export function photoEdit(props: PhotoEditProps): ReactNode {
  return photoEditRender?.(props) ?? null;
}
