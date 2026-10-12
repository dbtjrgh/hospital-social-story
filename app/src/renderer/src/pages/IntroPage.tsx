// 표지 (시안 m2): 무슨 검사인지 + 시작하기
import { useEffect, useRef } from 'react';
import type { ExamContent } from '../content/types';
import { Icon } from '../components/Icon';
import { Photo } from '../components/Photo';
import { SpeakButton } from '../components/SpeakButton';
import { TopBar } from '../components/TopBar';
import { useGuide } from '../fx/FxLayer';
import { speak } from '../lib/speech';
import { startRound, useProgress, useSettings } from '../lib/store';
import { useTapGuard } from '../lib/tapGuard';
import { order, type Goto } from './common';

function Sky() {
  return (
    <svg viewBox="0 0 400 92" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="sky-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cfe6ff" />
          <stop offset="1" stopColor="#f5faff" />
        </linearGradient>
      </defs>
      <rect width="400" height="92" fill="url(#sky-g)" />
      <g className="drift">
        <ellipse cx="70" cy="62" rx="58" ry="22" fill="#fff" />
        <ellipse cx="108" cy="50" rx="34" ry="22" fill="#fff" />
        <ellipse cx="292" cy="40" rx="30" ry="12" fill="#fff" opacity="0.9" />
      </g>
      <circle cx="350" cy="30" r="15" fill="#ffd166" />
      <g transform="translate(36 30)">
        <rect x="0" y="12" width="44" height="34" rx="4" fill="#e9f2ff" stroke="#b9d4fa" strokeWidth="2" />
        <rect x="14" y="0" width="16" height="16" rx="3" fill="#5aa0f2" />
        <path d="M22 4v8M18 8h8" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        <rect x="17" y="32" width="10" height="14" fill="#5aa0f2" />
      </g>
    </svg>
  );
}

export function IntroPage({ exam, goto }: { exam: ExamContent; goto: Goto }) {
  const start = useRef<HTMLButtonElement>(null);
  const guard = useTapGuard();
  const { completedCount } = useProgress(exam.id);
  const { readAloud } = useSettings();
  useGuide(start, exam.id);
  // 어려운 검사 이름 + 쉬운 말 (주소·QR로 표지부터 열면 첫 화면 카드의 쉬운 말을 못 봄 — 2026-10-06 최종 검토)
  const speech = [exam.title, exam.easyTitle, exam.cover.lead].filter(Boolean).join('. ') + '.';

  // 들어설 때 한 번 읽어 줌. 주소로 바로 열어 아직 아무것도 안 눌렀으면 브라우저가 막아서 조용히 넘어감
  useEffect(() => {
    if (readAloud) speak(speech, { cue: true });
  }, [exam.id]);

  return (
    <div className="screen">
      <TopBar exam={exam} title=" " />
      <div className="screen__body">
        <div className="sky reveal" style={order(0)}>
          <Sky />
        </div>
        <div className="intro__title-box reveal" style={order(1)}>
          <h1 className="intro__title">
            {exam.order}. {exam.title}
          </h1>
          {exam.easyTitle && <p className="intro__easy">{exam.easyTitle}</p>}
          {/* 우리가 쓴 초안이면 표지에도 표시 (주소·QR로 표지부터 열면 첫 화면의 안내 줄을 못 봄) */}
          {exam.source === 'draft' && <span className="intro__draft">원고 초안 · 병원 확인 전</span>}
        </div>
        <div className="page-head reveal" style={order(2)}>
          <p className="intro__lead">{exam.cover.lead}</p>
          <SpeakButton text={speech} />
        </div>
        <Photo
          className="reveal"
          style={order(3)}
          src={exam.cover.image}
          alt={exam.cover.imageAlt}
          ratio="4 / 3.1"
          view={exam.cover.imageView}
          field={{ file: `exams/${exam.id}.json`, image: '/cover/image', view: '/cover/imageView' }}
        />
        <p className="intro__meta reveal" style={order(4)}>
          <span>
            <Icon name="list" /> {exam.steps.length}단계
          </span>
          <span>
            <Icon name="star" /> 스티커 {exam.phases.length}개
          </span>
          {completedCount > 0 && (
            <span>
              <Icon name="refresh" /> {completedCount}번 연습했어요
            </span>
          )}
        </p>
      </div>
      <div className="bottom-bar reveal" style={order(5)}>
        <button ref={start} type="button" className="btn btn--primary btn--xl" onClick={guard(() => {
            startRound(exam); // 다 마친 검사면 새 회차로
            goto(1);
          })}>
          <span className="play-dot">
            <Icon name="play" />
          </span>
          시작하기
        </button>
      </div>
    </div>
  );
}
