// 다 모은 축하 (본인 요청 2026-10-06 "뿌듯하게, 요란하지 않게"): 5종을 모두 끝까지 하면 첫 화면 "모은 스티커"가 이 화면으로 가는 버튼이 됨.
// 메달 → 검사마다 스티커 줄이 차례로 붙음 → 별 몇 개가 천천히 떠오름. 소리는 들어설 때 읽어 주기만. 끝난 화면이라 빛 고리 없음.
import { useEffect, useRef } from 'react';
import { Icon } from '../components/Icon';
import { NextPersonButton } from '../components/NextPersonButton';
import { SpeakButton } from '../components/SpeakButton';
import { TopBar } from '../components/TopBar';
import { hospital } from '../content';
import { fx } from '../fx/fx';
import { asset } from '../lib/asset';
import { useFitToScreen } from '../lib/fitScreen';
import { navigate } from '../lib/router';
import { speak } from '../lib/speech';
import { markAllDoneSeen, useAppState, useSettings } from '../lib/store';
import { useTapGuard } from '../lib/tapGuard';
import { order, readyExams } from './common';

const MESSAGE = '병원에 가서도 오늘처럼 할 수 있어요';

export function CompletePage() {
  const progress = useAppState((s) => s.progress);
  const { readAloud, name: typedName } = useSettings();
  // 폰 자판이 이름 끝에 붙이는 띄어쓰기 → "민준 , 스티커…"가 되지 않게 (이름 부르기 연습과 같게, 2026-10-07 검수)
  const name = typedName.trim();
  const medal = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const guard = useTapGuard();
  const exams = readyExams();
  const stickers = exams.reduce((n, { exam }) => n + exam.phases.length, 0);
  const times = exams.reduce((n, { item }) => n + (progress[item.id]?.completedCount ?? 0), 0);
  const title = '병원 검사 연습을 모두 마쳤어요';
  const speech = `${title}. ${MESSAGE}.`;
  useFitToScreen(body, 'complete');

  useEffect(() => {
    markAllDoneSeen();
    if (readAloud) speak(speech);
    // 스티커 줄이 다 붙은 뒤 메달에서 별이 천천히 떠오름 (소리 없음)
    const t = window.setTimeout(() => {
      if (medal.current) fx.celebrate(medal.current, 12);
    }, (exams.length + 2) * 350 + 700);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="screen-wrap page-enter" data-dir="forward">
      <div className="screen complete">
        <TopBar title=" " />
        <div ref={body} className="screen__body">
          <section className="certificate">
            <div ref={medal} className="certificate__medal">
              <Icon name="star" />
            </div>
            <h1 className="reveal" style={order(1)}>
              {title}
            </h1>
            <p className="certificate__who reveal" style={order(2)}>
              {name ? `${name}, ` : ''}스티커 {stickers}개를 다 모았어요
            </p>
            <ul className="certificate__rows">
              {exams.map(({ item, exam }, i) => (
                <li key={item.id} className="certificate__row reveal" style={order(i + 3)}>
                  <span className="certificate__exam">{item.title}</span>
                  <span className="certificate__stickers">
                    {/* 한 줄씩 차례로 붙음 (줄 안의 스티커는 같이) */}
                    {exam.phases.map((phase) => (
                      <img key={phase.id} className="sticker-pop" style={order(i + 2)} src={asset(phase.sticker)} alt="" draggable={false} />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="certificate__from reveal" style={order(exams.length + 3)}>
              {hospital.name}
            </p>
          </section>

          <div className="page-head reveal" style={order(exams.length + 4)}>
            <p className="complete__message">{MESSAGE}</p>
            <SpeakButton text={speech} />
          </div>
          {times > 0 && <p className="reward__count">모두 {times}번 연습했어요</p>}
          <NextPersonButton />
        </div>

        <div className="bottom-bar">
          <button type="button" className="btn btn--navy" onClick={guard(() => navigate({ name: 'home' }))}>
            <Icon name="home" /> 첫 화면으로
          </button>
        </div>
      </div>
    </div>
  );
}
