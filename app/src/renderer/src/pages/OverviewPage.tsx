// 순서 알아보기 (시안 m3): 시각 일정표. 처음에 전체 순서를 보여 줘 "다음은 뭐지?" 불안을 줄임
import { useEffect, useRef } from 'react';
import type { ExamContent } from '../content/types';
import { Icon } from '../components/Icon';
import { SpeakButton } from '../components/SpeakButton';
import { TopBar } from '../components/TopBar';
import { useGuide } from '../fx/FxLayer';
import { asset } from '../lib/asset';
import { useFitToScreen } from '../lib/fitScreen';
import { speak } from '../lib/speech';
import { startRound, useSettings } from '../lib/store';
import { useTapGuard } from '../lib/tapGuard';
import { order, type Goto } from './common';

export function OverviewPage({ exam, goto }: { exam: ExamContent; goto: Goto }) {
  const next = useRef<HTMLButtonElement>(null);
  const guard = useTapGuard();
  // 글자를 아주 크게 하면 세로 태블릿에서 한 화면을 넘침 → 살짝 줄여 한 화면에 (10-07 검수)
  const body = useRef<HTMLDivElement>(null);
  useFitToScreen(body, exam.id);
  useGuide(next, exam.id);
  const speech = `검사 순서를 알아봐요. ${exam.phases.map((p, i) => `${i + 1}번, ${p.title}`).join('. ')}.`;
  const { readAloud } = useSettings();

  // 들어설 때 한 번 읽어 줌 (다 읽으면 빛 고리가 "첫 단계로")
  useEffect(() => {
    if (readAloud) speak(speech, { cue: true });
  }, [exam.id]);

  return (
    <div className="screen">
      <TopBar exam={exam} />
      <div ref={body} className="screen__body">
        <div className="page-head reveal" style={order(0)}>
          <div>
            <h1>검사 순서를 알아봐요</h1>
            <p>{exam.phases.length}가지 순서로 해요</p>
          </div>
          <SpeakButton text={speech} />
        </div>
        <ol className="phase-list">
          {exam.phases.map((phase, i) => (
            <li key={phase.id} className="reveal" style={order(i + 1)}>
              <div className="phase-row">
                <span className="phase-row__num">{i + 1}</span>
                {/* 그림이 없으면 스티커를 잘리지 않게 통째로 */}
                <img
                  className={phase.illustration ? 'phase-row__img' : 'phase-row__img phase-row__img--sticker'}
                  src={asset(phase.illustration ?? phase.sticker)}
                  alt=""
                  draggable={false}
                />
                <span>
                  <span className="phase-row__title">{phase.title}</span>
                  <span className="phase-row__count">할 일 {exam.steps.filter((s) => s.phase === phase.id).length}개</span>
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="bottom-bar">
        <button type="button" className="btn btn--back" onClick={guard(() => goto(-1))} aria-label="이전">
          <Icon name="back" />
        </button>
        <button
          ref={next}
          type="button"
          className="btn btn--primary"
          onClick={guard(() => {
            startRound(exam); // 주소로 순서 화면부터 열어도 다 마친 검사면 새 회차로
            goto(1);
          })}
        >
          첫 단계로 <Icon name="next" />
        </button>
      </div>
    </div>
  );
}
