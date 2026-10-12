// 앱 아이콘 만들기: yarn icon
//   파란 둥근 사각형 + 흰 십자(병원) + 노란 별(칭찬 스티커). 웹 페이지 아이콘(src/renderer/index.html)과 같은 모양.
//   16~32px 는 별을 빼고 십자만 (작으면 별이 뭉개져서)
// 만드는 것 (electron-vite 표준 위치):
//   build/icon.ico      설치 파일·실행 파일 아이콘 (electron-builder 가 씀, 16~256px 여러 크기)
//   build/icon.png      512px 원본
//   resources/icon.png  창 아이콘 (src/main 이 씀 — 개발 창에서도 보이게)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { ROOT } from './hospital-pack.mjs';

const BLUE_LIGHT = '#4C8DF0';
const BLUE_DARK = '#2457B8';
const STAR = '#FFC233';

/** 별 꼭짓점 (위를 향한 다섯 꼭지) */
function starPoints(cx, cy, outer, inner) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

/** small = 작은 크기용 (별 없이, 십자를 조금 더 크게) */
export function iconSvg(small = false) {
  const cross = small
    ? `<rect x="186" y="86" width="140" height="340" rx="30" fill="#fff"/>
       <rect x="86" y="186" width="340" height="140" rx="30" fill="#fff"/>`
    : `<rect x="190" y="84" width="124" height="300" rx="28" fill="#fff"/>
       <rect x="102" y="172" width="300" height="124" rx="28" fill="#fff"/>
       <polygon points="${starPoints(374, 372, 96, 42)}" fill="${STAR}" stroke="#fff" stroke-width="16" stroke-linejoin="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BLUE_LIGHT}"/>
      <stop offset="1" stop-color="${BLUE_DARK}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  ${cross}
</svg>`;
}

const png = (size) => sharp(Buffer.from(iconSvg(size <= 32))).resize(size, size).png().toBuffer();

/** PNG 여러 장을 담은 .ico (Windows Vista 이후 형식) */
function toIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // 예약
  header.writeUInt16LE(1, 2); // 1 = 아이콘
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // 0 = 256
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // 팔레트 없음
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4); // 색 평면
    e.writeUInt16LE(32, 6); // 32비트
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const buildDir = join(ROOT, 'build');
const resourcesDir = join(ROOT, 'resources');
mkdirSync(buildDir, { recursive: true });
mkdirSync(resourcesDir, { recursive: true });

const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = await Promise.all(sizes.map(async (size) => ({ size, data: await png(size) })));
writeFileSync(join(buildDir, 'icon.ico'), toIco(images));
const big = await png(512);
writeFileSync(join(buildDir, 'icon.png'), big);
writeFileSync(join(resourcesDir, 'icon.png'), big);
console.log('완료: build/icon.ico (16~256px), build/icon.png, resources/icon.png');
