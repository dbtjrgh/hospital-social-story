import { useState, type CSSProperties } from 'react';
import type { ImageView } from '../content/types';
import { asset, isVideo, mediaStatus } from '../lib/asset';
import { photoEdit, type MediaField } from '../lib/editHook';
import { useSettings } from '../lib/store';
import { Icon } from './Icon';

interface Props {
  src?: string;
  /** 보호자 설정으로 가린 사진 (바늘·피가 보일 수 있는 사진) */
  hidden?: boolean;
  alt: string;
  ratio?: string;
  className?: string;
  style?: CSSProperties;
  /** 배치 (편집기에서 화면으로 조정한 값, 원고의 imageView). 없으면 자리에 꽉 차게 가운데 */
  view?: ImageView;
  /** 원고에서 이 사진이 적힌 칸 (편집기만 씀: 영상으로 바꾸기·배치 저장) */
  field?: MediaField;
}

/** 배치 → CSS. 자리(=사진 상자) 크기 기준 % 로 옮기고 배율만큼 키움 → 화면 크기가 달라도 같은 모양 */
function viewStyle(view: ImageView | null | undefined): CSSProperties | undefined {
  if (!view || (view.x === 0 && view.y === 0 && view.zoom === 1)) return undefined;
  return { transform: `translate(${view.x}%, ${view.y}%) scale(${view.zoom})` };
}

/**
 * 사진. 파일이 없거나 못 읽으면 "사진 준비 중" 자리 (병원 사진이 들어올 자리).
 * 시안에서 자른 임시 사진이면 "임시 사진" 표시 → 같은 이름의 병원 사진으로 바꾸면 표시가 저절로 사라짐.
 * 모션 사진을 영상(mp4·webm)으로 받으면 소리 없이 반복 재생. 움직임 줄이기면 멈춘 첫 장면만 (2026-10-07 다듬기).
 */
export function Photo({ src, alt, ratio = '4 / 3', hidden = false, className = '', style, view, field }: Props) {
  const [failed, setFailed] = useState(false);
  // 편집기에서 배치를 조정하는 동안 바로 보여 줄 값 (저장 전)
  const [live, setLive] = useState<ImageView | null>(null);
  const { reduceMotion } = useSettings();
  const still =
    reduceMotion === 'on' || (reduceMotion === 'system' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false));
  // 비율은 변수로 → 세로 태블릿에서 사진이 남는 자리만큼 줄어들 때 원래 크기를 계산 (base.css "세로 태블릿")
  const box = { '--ratio': ratio, ...style } as CSSProperties;
  const status = mediaStatus(src);
  const media = viewStyle(live ?? view);

  if (hidden) {
    return (
      <div className={`photo photo--placeholder ${className}`} style={box} role="img" aria-label="사진을 가렸어요">
        <Icon name="eye" />
        <span>사진을 가렸어요</span>
        <small>보호자 메뉴에서 다시 볼 수 있어요</small>
      </div>
    );
  }

  if (!src || status === 'missing' || failed) {
    return (
      <div className={`photo photo--placeholder ${className}`} style={box} role="img" aria-label={alt}>
        <Icon name="image" />
        <span>사진 준비 중</span>
        <small>병원 사진으로 바뀔 자리예요</small>
        {/* 개발 화면에서만: 병원에서 받은 사진을 어떤 이름으로 넣으면 되는지 */}
        {import.meta.env.DEV && src && <code className="photo__path">media/{src}</code>}
        {/* 편집기의 "사진 넣기" (편집 모드에서만, 웹에서는 아무것도 없음) */}
        {src && photoEdit({ path: src, field, setLive })}
      </div>
    );
  }
  return (
    <div className={`photo ${className}`} style={box}>
      {isVideo(src) ? (
        <video
          // 멈춘 화면이면 첫 장면이 보이게 조금 뒤부터 (아이패드는 재생 전에는 빈 화면)
          src={still ? `${asset(src)}#t=0.1` : asset(src)}
          ref={(el) => {
            // 소리 없는 영상만 저절로 재생됨 (아이폰·아이패드는 속성까지 있어야 함)
            if (el) el.defaultMuted = el.muted = true;
          }}
          muted
          playsInline
          loop
          autoPlay={!still}
          preload="auto"
          role="img"
          aria-label={alt}
          style={media}
          onError={() => setFailed(true)}
        />
      ) : (
        <img src={asset(src)} alt={alt} style={media} onError={() => setFailed(true)} draggable={false} />
      )}
      {status === 'temp' && (
        <span className="photo__temp" aria-hidden="true">
          임시 사진
        </span>
      )}
      {photoEdit({ path: src, view, field, setLive })}
    </div>
  );
}
