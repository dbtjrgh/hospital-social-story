// tools/hospital-pack.mjs 의 타입 (vite.config.ts 에서 씀)
import type { Plugin } from 'vite';

export const ROOT: string;
export const PROJECT_ROOT: string;
export const HOSPITALS_DIR: string;
export const COMMON_DIR: string;
export const DEFAULT_HOSPITAL: string;
export function listHospitals(): string[];
export function hospitalDir(id: string): string;
export function resolveHospital(id?: string): string;
export function fingerprint(file: string): string;
export function mediaIndex(id: string): {
  mediaDir: string;
  files: string[];
  hospitalFiles: string[];
  commonFiles: string[];
  temp: string[];
};
export const PROJECT_FILE: string;
export const PROJECT_FORMAT: number;
/** content/project.json 내용 (모양은 src/renderer/src/content/project.ts 의 ProjectData) */
export function projectData(id: string): {
  format: number;
  hospital: { id: string; name: string; exams: string[] };
  exams: unknown[];
  media: { files: string[]; temp: string[] };
};
export function hospitalPack(id: string, options?: { withContent?: boolean }): Plugin;
