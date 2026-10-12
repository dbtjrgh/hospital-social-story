// 시작점: ① 프로젝트(content/project.json = 병원 설정·검사 원고·사진 목록)를 읽고 ② 화면(boot.tsx)을 불러와 띄움.
// 원고를 빌드에 묶지 않고 실행할 때 읽음 → 편집기 앱이 Node·Vite 없이 결과물을 빌드할 수 있음 (CLAUDE.md 1-c)
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles/tokens.css';
import './styles/base.css';
import { loadProject } from './content/project';

const root = document.getElementById('root')!;

/** 프로젝트를 못 읽었을 때 안내 (흰 화면 대신). 보통은 파일을 더블클릭해 열었거나(file://) 업로드가 빠진 경우 */
function showLoadError(err: unknown): void {
  console.error('[시작] 프로젝트를 읽지 못함:', err);
  const box = document.createElement('div');
  box.className = 'boot-error';
  box.setAttribute('role', 'alert');
  const title = document.createElement('h1');
  title.textContent = '내용을 불러오지 못했어요';
  const body = document.createElement('p');
  body.textContent = '웹서버에 올린 주소로 열어 주세요. 파일을 더블클릭해서는 열 수 없어요. content 폴더가 같이 올라갔는지도 확인해 주세요.';
  const detail = document.createElement('p');
  detail.className = 'boot-error__detail';
  detail.textContent = err instanceof Error ? err.message : String(err);
  box.append(title, body, detail);
  root.replaceChildren(box);
}

loadProject()
  .then(() => import('./boot'))
  .then(({ boot }) => boot(root))
  .catch(showLoadError);
