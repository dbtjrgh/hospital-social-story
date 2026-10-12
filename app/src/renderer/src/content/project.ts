// 프로젝트 데이터 = 병원 설정 + 검사 원고 + 사진·소리 목록. 플레이어가 시작할 때 content/project.json 에서 한 번 읽음 (main.tsx).
// 원고를 빌드할 때 묶지 않고 실행할 때 읽음 → 편집기(Electron 앱)가 Node·Vite 없이 결과물을 빌드할 수 있음 (CLAUDE.md 1-c)
// 만드는 곳: 개발 서버·웹 빌드는 tools/hospital-pack.mjs (projectData), 편집기 빌드는 앱이 프로젝트 파일(.ssproj)에서.
// 이 파일은 다른 화면 코드를 불러오지 않음 → 읽기 전에 화면 코드가 먼저 돌지 않게 (main.tsx 가 읽은 뒤 화면을 불러옴)
import type { ExamContent, HospitalConfig } from './types';

/** project.json 형식 버전. 모양이 바뀌면 올리고, 옛 형식을 옮기는 코드를 더함 */
export const PROJECT_FORMAT = 1;

export interface ProjectData {
  format: number;
  hospital: HospitalConfig;
  /** 검사 원고 전부 (보일 검사와 순서는 hospital.exams) */
  exams: ExamContent[];
  media: {
    /** content/ 아래 경로 (병원 파일 + 공통 그림) */
    files: string[];
    /** 시안에서 자른 임시 사진 그대로인 파일 */
    temp: string[];
  };
}

let current: ProjectData | null = null;
/** 사진·소리 주소 앞부분. 웹은 content/ (base './' 기준 상대 경로), 편집기는 열린 프로젝트를 주는 project://media/ */
let mediaRoot = `${import.meta.env.BASE_URL}content/`;

export function mediaBase(): string {
  return mediaRoot;
}

/** 읽어 둔 프로젝트. loadProject 가 끝나기 전에 부르면 오류 (화면 코드는 그 뒤에 불러오므로 생기지 않음) */
export function project(): ProjectData {
  if (!current) throw new Error('프로젝트를 아직 읽지 않았어요 (content/project.json)');
  return current;
}

export function setProject(data: ProjectData): void {
  current = data;
}

/**
 * 프로젝트 읽기. 편집기(Electron) 안이면 열린 프로젝트를 앱에서 받고(window.ssApp), 웹이면 content/project.json.
 * 실패하면 이유를 담은 오류 (main.tsx 가 화면에 안내)
 */
export async function loadProject(): Promise<ProjectData> {
  let data: ProjectData;
  if (window.ssApp) {
    const got = await window.ssApp.getProject();
    data = got.data;
    mediaRoot = got.mediaBase;
  } else {
    const res = await fetch(`${import.meta.env.BASE_URL}content/project.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`content/project.json 을 받지 못했어요 (${res.status})`);
    data = (await res.json()) as ProjectData;
  }
  if (!data || typeof data !== 'object' || !data.hospital || !Array.isArray(data.exams) || !data.media) {
    throw new Error('content/project.json 의 모양이 맞지 않아요');
  }
  if (data.format > PROJECT_FORMAT) {
    throw new Error(`더 새로운 형식의 프로젝트예요 (형식 ${data.format}). 앱을 새 버전으로 바꿔 주세요`);
  }
  setProject(data);
  return data;
}
