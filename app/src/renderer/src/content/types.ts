// 검사 원고(JSON)의 모양. 병원 원고가 오면 hospitals/<병원id>/exams/<검사id>.json 만 바꿉니다.
// 이미지·소리 경로는 content/ 기준 상대경로 (예: "xray/position.jpg"):
//   병원 사진·음원 = hospitals/<병원id>/media/<경로>, 공통 그림(스티커 등) = public/content/<경로>
// 이 타입을 바꾸면 tools/check.mjs 의 점검도 같이 맞출 것.

export type ExamId = 'xray' | 'ultrasound' | 'ecg' | 'blood' | 'iv';
export type ThemeName = 'blue' | 'green' | 'yellow' | 'pink' | 'purple';

/** 효과음 이름 → content/sounds/<이름>.mp3 (병원 음원이 없을 때 쓰는 기본 효과음 자리) */
export type SynthId = 'chime' | 'xray-beep' | 'ecg-beep' | 'gel' | 'announce' | 'tick' | 'pad';

export interface SoundRef {
  /** 병원 음원 파일 (있으면 우선) */
  file?: string;
  /** 효과음 이름 → content/sounds/<이름>.mp3 파일 (없으면 소리 없이 로그만) */
  synth?: SynthId;
  /** 버튼에 보이는 이름: "검사 소리 들어보기" */
  label: string;
}

export type SensoryKind =
  | 'sound'
  | 'cold'
  | 'pressure'
  | 'light'
  | 'sting'
  | 'smell'
  | 'wait'
  | 'touch';

export interface Sensory {
  kind: SensoryKind;
  /** "판이 차가울 수 있어요" */
  text: string;
  sound?: SoundRef;
}

/** 몸 그림의 부위 (src/practice/BodyFigure.tsx) */
export type BodyPart = 'head' | 'chest' | 'belly' | 'arm' | 'leg';
/** 패드(심전도 스티커) 붙이는 자리 (src/practice/BodyFigure.tsx 의 PAD_SPOT) */
export type PadSpot = 'chest-1' | 'chest-2' | 'chest-3' | 'wrist-left' | 'wrist-right' | 'ankle-left' | 'ankle-right';

export type Practice =
  /**
   * 꾹 누르고 가만히 있기 (엑스레이 3초, 채혈 팔 펴기).
   * figure 'arm' = 동그라미 안에 쭉 편 팔 그림, countAloud = "하나, 둘…" 읽으며 숫자가 올라감, feel = 성공하면 느낌 듣기,
   * freeze = "얼음!" 놀이 말로 안내, photo 'chest' = 성공하면 동그라미 안에 내 가슴 사진(그림)이 나옴 (엑스레이, 2026-10-07)
   */
  | {
      type: 'hold';
      seconds: number;
      prompt: string;
      success: string;
      countAloud?: boolean;
      figure?: 'arm';
      feel?: { text: string; sound?: SoundRef };
      freeze?: boolean;
      photo?: 'chest';
    }
  /** 이름을 부르면 "네!" 누르기 */
  | { type: 'nameCall' }
  /** 몸 그림에서 검사할 곳 누르기 → 맞으면 느낌 듣기 (초음파: 배를 눌러 젤 느낌). bareBelly = 윗옷을 올린 모습 */
  | {
      type: 'tapArea';
      target: BodyPart;
      prompt: string;
      success: string;
      feel?: { text: string; sound?: SoundRef };
      bareBelly?: boolean;
    }
  /** 몸 그림의 자리에 패드 붙이기 (끌어다 놓기 또는 자리 누르기) → 첫 패드에 느낌 듣기 (심전도) */
  | {
      type: 'placePads';
      spots: PadSpot[];
      /** 앞 단계에서 이미 붙인 자리 (처음부터 패드로 그려 둠, 붙일 수는 없음). 예: 손목·발목 단계의 가슴 패드 */
      prePlaced?: PadSpot[];
      prompt: string;
      success: string;
      feel?: { text: string; sound?: SoundRef };
      bareChest?: boolean;
      bareFeet?: boolean;
    }
  /** 섞인 카드를 순서대로 고르기 (정맥주사: 고무줄 → 솜 → 따끔 → 테이프). items 는 맞는 순서로, kind = 카드 그림 */
  | { type: 'sequence'; items: { label: string; kind?: SensoryKind }[]; prompt: string; success: string }
  /** 심호흡: 들이마셔요(3초) → 내쉬어요(4초) 를 count 번 */
  | { type: 'breathe'; count: number; prompt: string; success: string }
  /**
   * 따끔할 때 볼 것 고르기 → 고른 그림을 크게 보며 숫자를 셈 (채혈: 다른 곳 보기 대처, 2026-10-07).
   * choices: 그림(image, 사진 경로) 또는 아이콘(icon, components/Icon 이름). label 에 {companion} 쓸 수 있음
   */
  | {
      type: 'lookAway';
      seconds: number;
      choices: { label: string; image?: string; icon?: string }[];
      prompt: string;
      success: string;
    };

/**
 * 사진·영상 배치 (편집기에서 화면으로 조정, 2026-10-08). 없으면 자리에 꽉 차게 가운데 (= x 0, y 0, zoom 1)
 * x·y = 가운데에서 옮긴 거리 (자리 폭·높이의 %, 오른쪽·아래가 +), zoom = 크기 배율 (1 = 자리에 꽉 차게, 0.3~4)
 */
export interface ImageView {
  x: number;
  y: number;
  zoom: number;
}

export interface Step {
  id: string;
  /** 속한 묶음 id (스티커 단위) */
  phase: string;
  /** 행동 1개. 토큰: {companion:와} {companion:가} … → 설정 호칭 + 알맞은 조사 */
  text: string;
  /** 설명·관점 문장 */
  sub?: string;
  /** 사진 또는 짧은 영상(mp4·webm) */
  image?: string;
  imageAlt: string;
  imageView?: ImageView;
  /** 읽어 줄 문장 (없으면 text + sub) */
  speech?: string;
  /** 병원 내레이션 음원 (없으면 소리 없이 로그만) */
  audio?: string;
  sensory?: Sensory[];
  practice?: Practice;
  caregiverTip?: string;
  /** 바늘·피가 보일 수 있는 사진 → 보호자 설정 "바늘·피 사진 숨기기"면 가림 */
  sensitive?: boolean;
}

export interface Phase {
  id: string;
  title: string;
  /** 스티커 그림 */
  sticker: string;
  /** 순서 알아보기 화면의 그림 (없으면 sticker) */
  illustration?: string;
}

/** hospitals/<id>/hospital.json */
export interface HospitalConfig {
  id: string;
  name: string;
  /** 검사 선택 화면에 보일 검사 id와 순서 */
  exams: string[];
}

export interface ExamContent {
  id: ExamId;
  order: number;
  title: string;
  easyTitle?: string;
  theme: ThemeName;
  /** 원고 출처: PDF 원문 / 우리 초안 (병원 검토 전) */
  source: 'pdf' | 'draft';
  cover: { image: string; imageAlt: string; lead: string; imageView?: ImageView };
  caregiver: { before: string[]; tips: string[] };
  phases: Phase[];
  steps: Step[];
  reward: { message: string };
}
