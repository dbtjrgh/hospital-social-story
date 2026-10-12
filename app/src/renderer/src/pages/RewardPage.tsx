// 칭찬 스티커판 (시안 m5): 끝이 보이게. 다시 연습하기를 늘 보이게 해서 반복 연습을 격려.
// 스티커를 다 모았을 때만 칭찬 말과 별 (주소로 바로 열거나 "다시 연습하기" 뒤 뒤로 가기로 오면 0개일 수 있음 — 2026-10-06 최종 검토)
import { useEffect, useRef } from 'react';
import type { ExamContent } from '../content/types';
import { Icon } from '../components/Icon';
import { NextPersonButton } from '../components/NextPersonButton';
import { SpeakButton } from '../components/SpeakButton';
import { TopBar } from '../components/TopBar';
import { fx } from '../fx/fx';
import { asset } from '../lib/asset';
import { useFitToScreen } from '../lib/fitScreen';
import { navigate } from '../lib/router';
import { restartExam, useProgress } from '../lib/store';
import { useTapGuard } from '../lib/tapGuard';
import { CHEER_IMAGE, order } from './common';

export function RewardPage({ exam }: { exam: ExamContent }) {
  const progress = useProgress(exam.id);
  const board = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const guard = useTapGuard();
  // 작은 세로 태블릿(600×880)에서 "다음 사람을 위해 지우기"가 아래 막대 뒤로 밀렸음 → 단계 화면처럼 넘치면 살짝 줄임 (2026-10-07 검수)
  useFitToScreen(body, exam.id);
  const earned = exam.phases.filter((p) => progress.stickers.includes(p.id)).length;
  const all = earned === exam.phases.length;
  const message = all ? exam.reward.message : '끝까지 연습하면 스티커를 모두 받아요';
  const speech = `스티커 ${earned}개를 모았어요${all ? '. 모두 모았어요!' : '.'} ${message}`;

  useEffect(() => {
    if (!all) return;
    // 스티커가 하나씩 붙은 뒤에 별이 천천히 떠오름. 소리는 내지 않음 (누르지 않았는데 소리가 나지 않게)
    const t = window.setTimeout(() => {
      if (board.current) fx.celebrate(board.current, 14);
    }, exam.phases.length * 350 + 500);
    return () => window.clearTimeout(t);
  }, [exam.phases.length, all]);

  return (
    <div className="screen">
      <TopBar exam={exam} />
      <div ref={body} className="screen__body">
        <div className="page-head reveal" style={order(0)}>
          <div>
            <h1>칭찬 스티커판</h1>
            <p>
              스티커 {earned}개를 모았어요{all ? '. 모두 모았어요!' : ''}
            </p>
          </div>
          {/* 들어설 때 저절로 읽지는 않음 (3-1 "스티커판이 열릴 때 저절로 나는 소리 없음"). 누르면 읽어 줌 */}
          <SpeakButton text={speech} />
        </div>

        <div ref={board} className="sticker-board">
          {exam.phases.map((phase, i) => {
            const has = progress.stickers.includes(phase.id);
            return (
              <div key={phase.id} className="sticker-slot">
                <span className="sticker-slot__label">
                  <b>{i + 1}</b>
                  {phase.title}
                </span>
                {has ? (
                  <img className="sticker-slot__img sticker-pop" style={order(i)} src={asset(phase.sticker)} alt={`${phase.title} 스티커`} />
                ) : (
                  <span className="sticker-slot__img sticker-slot__img--empty" role="img" aria-label="아직 없는 스티커">
                    {i + 1}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="reward__cheer reveal" style={order(4)}>
          <p className="reward__bubble">{message}</p>
          <img src={asset(CHEER_IMAGE)} alt="아이와 엄마가 기뻐하고 있어요" draggable={false} />
        </div>
        {progress.completedCount > 0 && <p className="reward__count">지금까지 {progress.completedCount}번 연습했어요</p>}
        {/* 검사를 다 마쳤을 때만: 병원 공용 태블릿에서 다음 사람에게 넘기기 전에 (길게 누르기) */}
        {all && <NextPersonButton />}
      </div>

      <div className="bottom-bar bottom-bar--pair">
        <button
          type="button"
          className="btn btn--soft"
          onClick={guard(() => {
            restartExam(exam.id);
            navigate({ name: 'exam', examId: exam.id, page: 1 });
          })}
        >
          <Icon name="refresh" /> 다시 연습하기
        </button>
        <button type="button" className="btn btn--navy" onClick={guard(() => navigate({ name: 'home' }))}>
          <Icon name="home" /> 첫 화면으로
        </button>
      </div>
    </div>
  );
}
