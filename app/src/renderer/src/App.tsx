import { Fragment, useEffect } from 'react';
import { getExam } from './content';
import { FxLayer } from './fx/FxLayer';
import { useContentVersion } from './lib/editHook';
import { navigate, useRoute } from './lib/router';
import { useAppState, useSettings } from './lib/store';
import { allExamsDone } from './pages/common';
import { CompletePage } from './pages/CompletePage';
import { ExamFlow } from './pages/ExamFlow';
import { HomePage } from './pages/HomePage';
import { SetupDialog } from './components/SetupDialog';

export function App() {
  const route = useRoute();
  const { textScale, reduceMotion } = useSettings();
  const exam = route.name === 'exam' ? getExam(route.examId) : undefined;
  const allDone = useAppState((s) => allExamsDone(s.progress));
  const noSetup = useAppState((s) => s.setupSeen || !s.settings.showSetup);
  const contentVersion = useContentVersion();

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--text-scale', String(textScale));
    root.dataset.reduceMotion = reduceMotion;
  }, [textScale, reduceMotion]);

  // 없는 검사 주소면 처음 화면으로. 축하 화면도 다 모았을 때만
  const wrongPage = (route.name === 'exam' && !exam) || (route.name === 'complete' && !allDone);
  useEffect(() => {
    if (wrongPage) navigate({ name: 'home' }, { replace: true });
  }, [wrongPage]);

  let page;
  if (exam && route.name === 'exam') page = <ExamFlow exam={exam} page={route.page} />;
  else if (route.name === 'complete' && allDone) page = <CompletePage />;
  // 처음 열 때(다음 사람 지우기 뒤도) 첫 화면 위에 보호자 초기 설정 창 (10-08부터 창, 뒤에 검사 고르기가 보임).
  // 검사 주소로 바로 들어오면 안 띄움. 보호자 메뉴 "초기 설정 화면"을 끈 기기는 늘 첫 화면만
  else
    page = (
      <>
        <HomePage />
        {!noSetup && <SetupDialog />}
      </>
    );

  // .stage = 화면 모양(폰·세로 태블릿·가로 태블릿·큰 화면 틀)을 정하는 기준 상자 (base.css 컨테이너 쿼리, 2026-10-08)
  // 웹에서는 브라우저 창 전체, 편집기에서는 양옆 칸 사이 가운데 영역 → 칸 너비를 바꾸면 그 크기에 맞춰 모양이 바뀜
  return (
    <div className="stage">
      <div className="app-frame" data-app-frame data-theme={exam?.theme ?? 'blue'}>
        {/* 편집기에서 글을 바로 고치면 페이지만 새로 그림 (lib/editHook.ts) */}
        <Fragment key={contentVersion}>{page}</Fragment>
        <FxLayer />
      </div>
    </div>
  );
}
