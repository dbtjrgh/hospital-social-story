// 검사 선택 (시안 m1). 각 검사는 자기 주소(#/xray)만으로도 바로 열 수 있음.
// 뿌듯함 (2026-10-06): 위에 "모은 스티커", 카드마다 그 검사 스티커 칸, 끝까지 한 검사는 "다 했어요" 표시,
// 검사를 마치고 돌아오면 그 카드에서 별이 천천히 떠오름. 빛 고리는 아직 안 한 검사로만 안내.
// 5종을 다 하면 "모은 스티커"가 "다 모았어요" 버튼이 되어 축하 화면(CompletePage)으로. 그 화면을 보기 전까지는 빛 고리가 이 버튼으로.
// 2026-10-07 (본인 선택): 모은 스티커는 25개까지 모두 작게 (검사마다 묶음, 폰에서도), 카드의 아직 없는 스티커는 점선 빈칸 대신 흐린 스티커
// (처음 보면 점선 동그라미가 무엇인지 알기 어려웠음 → 무엇을 받는지 미리 보임).
import { useEffect, useRef, useState } from 'react';
import type { ExamContent, Phase } from '../content/types';
import { catalog, getExam } from '../content';
import { Icon } from '../components/Icon';
import { CaregiverButton } from '../components/TopBar';
import { useGuide } from '../fx/FxLayer';
import { fx } from '../fx/fx';
import { asset } from '../lib/asset';
import { useFitToScreen } from '../lib/fitScreen';
import { navigate } from '../lib/router';
import { getState, useAppState, type ExamProgress } from '../lib/store';
import { useTapGuard } from '../lib/tapGuard';
import { allExamsDone, order } from './common';

/** 아이가 가진 스티커: 끝까지 마친 검사는 전부 ("다시 연습하기"로 판을 비워도 남음), 하는 중이면 받은 것만 */
function ownedStickers(exam: ExamContent, p: ExamProgress | undefined): Phase[] {
  if (!p) return [];
  return p.completedCount > 0 ? exam.phases : exam.phases.filter((phase) => p.stickers.includes(phase.id));
}

/** 이 첫 화면을 마지막으로 봤을 때의 마친 횟수 → 늘었으면 방금 끝낸 검사라 축하 (앱을 연 때부터 셈) */
const seenCompleted = new Map(Object.entries(getState().progress).map(([id, p]) => [id, p.completedCount]));

export function HomePage() {
  const progress = useAppState((s) => s.progress);
  const seenFinale = useAppState((s) => s.allDoneSeen);
  const guide = useRef<HTMLButtonElement>(null);
  const shelf = useRef<HTMLButtonElement>(null);
  const cards = useRef(new Map<string, HTMLButtonElement>());
  // 연타 막기: 폰에서는 스티커판·축하 화면의 "첫 화면으로" 자리에 카드가 놓여, 두 번째 누름이 고르지 않은 검사를 엶 (2026-10-06 최종 검토)
  const guard = useTapGuard();
  // 세로 태블릿에서 글자를 아주 크게 하면 한 화면을 넘침 → 단계 화면처럼 살짝 줄여 한 화면에 (10-07 검수, lib/fitScreen.ts)
  const body = useRef<HTMLDivElement>(null);
  useFitToScreen(body, 'home');

  const items = catalog.map((item) => {
    const exam = getExam(item.id);
    const p = progress[item.id];
    return { item, exam, p, owned: exam ? ownedStickers(exam, p) : [], done: !!p?.completedCount };
  });
  const owned = items.flatMap((x) => x.owned);
  // 모은 스티커 전부, 검사마다 한 묶음 (25개면 태블릿 2줄·폰 3줄)
  const shelfStickers = (
    <span className="shelf__stickers" aria-hidden="true">
      {items
        .filter((x) => x.owned.length)
        .map((x) => (
          <span key={x.item.id} className="shelf__group">
            {x.owned.map((phase) => (
              <img key={phase.id} src={asset(phase.sticker)} alt="" draggable={false} />
            ))}
          </span>
        ))}
    </span>
  );
  const ready = items.filter((x) => x.exam);
  const allDone = allExamsDone(progress);
  // 빛 고리는 안 한 검사로: 하다 만 검사 → 아직 안 해 본 검사. 다 했으면 축하 화면 버튼으로 (본 뒤에는 안내 없음)
  const target =
    ready.find((x) => !x.done && (x.p?.checked.length || x.p?.stickers.length)) ?? ready.find((x) => !x.done);
  const finale = allDone && !seenFinale;
  useGuide(guide, `home:${target?.item.id ?? (finale ? 'complete' : '-')}`);

  // 방금 끝낸 검사 (첫 화면에 올 때 한 번 셈): 카드가 다 나타난 뒤 별이 천천히 떠오름 (소리 없음)
  const [fresh] = useState(() =>
    catalog
      .map((c) => c.id)
      .filter((id) => {
        const now = getState().progress[id]?.completedCount ?? 0;
        const seen = seenCompleted.get(id) ?? 0;
        if (now < seen) seenCompleted.set(id, now); // 진행 초기화로 줄었으면 거기서부터 다시 셈
        return now > seen;
      }),
  );
  // 첫 화면에 머문 채 보호자 메뉴로 기록을 지워도 "본 값"을 낮춤 → 지운 뒤 처음 마친 검사도 별이 뜸 (10-07 검수)
  useEffect(() => {
    for (const [id, seen] of seenCompleted) {
      const now = progress[id]?.completedCount ?? 0;
      if (now < seen) seenCompleted.set(id, now);
    }
  }, [progress]);
  useEffect(() => {
    if (!fresh.length) return;
    const timers: number[] = [];
    // 별을 띄울 때 "봤음"으로 적음 (개발 모드에서 효과가 두 번 돌아도, 그 전에 화면을 떠나도 놓치지 않게)
    timers.push(
      window.setTimeout(() => {
        // 방금 마지막 검사까지 마침 → 카드 대신 "다 모았어요"에서만 별, 이어서 바로 빛 고리 (여러 곳이 같이 움직이지 않게)
        const last = allExamsDone(getState().progress) && !getState().allDoneSeen;
        if (last && shelf.current) {
          fx.celebrate(shelf.current, 12);
          timers.push(window.setTimeout(() => fx.promptNow(), 1600));
        }
        for (const id of fresh) {
          const el = cards.current.get(id);
          if (el && !last) fx.celebrate(el, 12);
          seenCompleted.set(id, getState().progress[id]?.completedCount ?? 0);
        }
      }, 1200),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [fresh]);

  return (
    <div className="screen">
      <div ref={body} className="home-body">
        <header className="home-head">
          <div className="home-head__row">
            <span className="brand">
              <Icon name="hospital" /> 병원 검사 연습
            </span>
            <CaregiverButton />
          </div>
          <h1 className="reveal" style={order(0)}>어떤 검사를 연습할까요?</h1>
          <p className="reveal" style={order(1)}>
            {allDone ? '모든 검사를 연습했어요. 정말 멋져요!' : '연습할 검사를 골라 주세요'}
          </p>
        </header>

        {allDone ? (
          <button
            ref={(el) => {
              shelf.current = el;
              if (finale) guide.current = el;
            }}
            type="button"
            className="shelf shelf--complete reveal"
            style={order(2)}
            onClick={guard(() => navigate({ name: 'complete' }))}
          >
            <span className="shelf__star">
              <Icon name="star" />
            </span>
            {/* 좁은 폰에서 줄이 바뀌면 "스티커 N개 / 다 모았어요!"로 나뉘게 */}
            <span className="shelf__text">
              <span>
                스티커 <b>{owned.length}</b>개
              </span>{' '}
              <span>다 모았어요!</span>
            </span>
            <span className="shelf__go">
              보기 <Icon name="next" />
            </span>
            {shelfStickers}
          </button>
        ) : (
          <div className="shelf reveal" style={order(2)} data-empty={owned.length === 0}>
            <span className="shelf__star">
              <Icon name="star" />
            </span>
            {owned.length ? (
              <>
                <span className="shelf__text">
                  모은 스티커 <b>{owned.length}</b>개
                </span>
                {shelfStickers}
              </>
            ) : (
              <span className="shelf__text">끝까지 연습하면 스티커를 받아요</span>
            )}
          </div>
        )}

        <ul className="exam-grid">
          {items.map(({ item, exam, p, owned: mine, done }, i) => (
            <li key={item.id} className="reveal" style={order(i + 3)}>
              <button
                ref={(el) => {
                  if (el) cards.current.set(item.id, el);
                  else cards.current.delete(item.id);
                  if (target?.item.id === item.id) guide.current = el;
                }}
                type="button"
                className="exam-card"
                data-theme={item.theme}
                data-done={done}
                aria-disabled={!exam}
                onClick={guard(() => exam && navigate({ name: 'exam', examId: item.id, page: 0 }))}
              >
                <img src={asset(item.cover)} alt={item.coverAlt} draggable={false} />
                {done && (
                  <span className="exam-card__done">
                    <Icon name="check" /> {p!.completedCount > 1 ? `${p!.completedCount}번 했어요` : '다 했어요'}
                  </span>
                )}
                <span className="exam-card__title">{item.title}</span>
                <span className="exam-card__easy">{item.easyTitle}</span>
                {exam ? (
                  <span className="exam-card__stickers" role="img" aria-label={`스티커 ${mine.length}개 / ${exam.phases.length}개`}>
                    {exam.phases.map((phase) =>
                      mine.includes(phase) ? (
                        <img key={phase.id} src={asset(phase.sticker)} alt="" draggable={false} />
                      ) : (
                        // 아직 없는 스티커: 흐리게 미리 보여 줌 (받으면 색이 들어옴)
                        <img key={phase.id} className="exam-card__slot" src={asset(phase.sticker)} alt="" draggable={false} />
                      ),
                    )}
                  </span>
                ) : (
                  <span className="exam-card__chip">준비 중</span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <p className="draft-note">시안 · 사진은 임시 이미지이며, 원고·사진·음성은 병원 자료로 바뀝니다</p>
      </div>
    </div>
  );
}
