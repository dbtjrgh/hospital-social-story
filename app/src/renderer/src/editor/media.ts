// 넣을 파일 다듬기 (편집 모드, 화면 안에서 — 설치한 exe 에는 sharp 같은 도구가 없음, CLAUDE.md 1-c)
//   사진: 화면용 크기로 줄여서(긴 변 1600px) 원래 자리의 형식(jpg·png·webp)으로. 움직이는 GIF 는 그대로
//   소리: 그대로 (mp3·wav·m4a·ogg)

/** 사진이 들어갈 자리의 긴 변 최대 (태블릿 화면 폭 × 2배 정도. 원본 몇 MB 를 그대로 넣으면 검사를 열 때 느려짐 — CLAUDE.md 2장) */
const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.85;

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
/** 사진 자리에 영상도 넣을 수 있을 때 (원고에 칸이 있는 자리: 단계·표지) */
export const MEDIA_ACCEPT = `${IMAGE_ACCEPT},video/mp4,video/webm`;
/** 영상은 줄이지 않고 그대로 넣으므로 크기를 막음 (검사를 열 때 다 받아 둠 — CLAUDE.md 2장) */
const VIDEO_MAX_MB = 50;

export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|avi)$/i.test(file.name);
}

/** 영상 파일 → { 확장자, 바이트 }. mp4·webm 만 (아이패드·안드로이드·PC 브라우저에서 다 재생되는 형식) */
export async function prepareVideo(file: File): Promise<{ ext: string; bytes: Uint8Array }> {
  const ext = file.type === 'video/webm' || /\.webm$/i.test(file.name) ? 'webm' : file.type === 'video/mp4' || /\.(mp4|m4v)$/i.test(file.name) ? 'mp4' : '';
  if (!ext) throw new MediaError('MP4·WEBM 영상만 넣을 수 있어요. 휴대폰 영상(MOV)은 MP4로 바꿔서 넣어 주세요');
  if (file.size > VIDEO_MAX_MB * 1024 * 1024) {
    throw new MediaError(`영상이 너무 커요 (${VIDEO_MAX_MB}MB 까지). 짧게 자르거나 작게 만들어 넣어 주세요`);
  }
  return { ext, bytes: new Uint8Array(await file.arrayBuffer()) };
}
export const AUDIO_ACCEPT = 'audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/ogg,.mp3,.wav,.m4a,.ogg';

const AUDIO_EXT: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/ogg': 'ogg',
};

export class MediaError extends Error {}

function extOf(path: string): string {
  return path.slice(path.lastIndexOf('.') + 1).toLowerCase();
}

/** 사진 파일 → 그 자리(targetPath) 형식의 바이트. 사진이 아니면 MediaError */
export async function prepareImage(file: File, targetPath: string): Promise<Uint8Array> {
  if (!file.type.startsWith('image/')) {
    throw new MediaError('사진 파일이 아니에요. JPG·PNG·WEBP 사진을 넣어 주세요');
  }
  // 영상 자리에 사진을 넣으면 jpg 로 (actions.ts 가 파일 이름을 바꿈)
  const target = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extOf(targetPath)) ? extOf(targetPath) : 'jpg';
  // 움직이는 GIF 자리에 GIF 를 넣으면 그대로 (캔버스로 그리면 움직임이 사라짐)
  if (file.type === 'image/gif' && target === 'gif') return new Uint8Array(await file.arrayBuffer());

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new MediaError('사진을 열지 못했어요. 다른 사진으로 해 주세요');
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  const type = target === 'png' ? 'image/png' : target === 'webp' ? 'image/webp' : 'image/jpeg';
  if (type === 'image/jpeg') {
    // JPG 는 투명이 없으므로 흰 바탕
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type, quality: JPEG_QUALITY });
  return new Uint8Array(await blob.arrayBuffer());
}

/** 소리 파일 → { 확장자, 바이트 }. 소리가 아니면 MediaError */
export async function prepareAudio(file: File): Promise<{ ext: string; bytes: Uint8Array }> {
  const ext = AUDIO_EXT[file.type] ?? (['mp3', 'wav', 'm4a', 'ogg'].includes(extOf(file.name)) ? extOf(file.name) : '');
  if (!ext) throw new MediaError('소리 파일이 아니에요. MP3·WAV·M4A 소리를 넣어 주세요');
  if (file.size > 20 * 1024 * 1024) throw new MediaError('소리 파일이 너무 커요 (20MB 까지). 짧게 잘라서 넣어 주세요');
  return { ext, bytes: new Uint8Array(await file.arrayBuffer()) };
}

/** 경로의 확장자만 바꿈: voice/xray/s1.mp3 → voice/xray/s1.wav */
export function withExt(path: string, ext: string): string {
  const dot = path.lastIndexOf('.');
  return `${dot > path.lastIndexOf('/') ? path.slice(0, dot) : path}.${ext}`;
}

/** 파일 고르기 창 (input type=file). 고르지 않으면 null */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
