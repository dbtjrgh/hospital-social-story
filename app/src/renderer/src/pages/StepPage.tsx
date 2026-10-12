// 단계 화면 (시안 m4): 한 화면에 행동 하나. 모든 단계가 같은 배치.
// 사진 → 문장 → 감각 안내 → 연습 → 다음 미리보기 → [이전] [했어요]
import { useEffect, useRef, useState } from 'react';
import type { ExamContent, Phase } from '../content/types';
import { Icon } from '../components/Icon';
import { Photo } from '../components/Photo';
import { Progress } from '../components/Progress';
import { plain, ReadText, RichText, useFill } from '../components/RichText';
import { SenseCard } from '../components/SenseCard';
import { SpeakButton } from '../components/SpeakButton';
import { StickerToast } from '../components/StickerToast';
import { TopBar } from '../components/TopBar';
import { useGuide } from '../fx/FxLayer';
import { fx } from '../fx/fx';
import { devEvent } from '../lib/devlog';
import { useFitToScreen } from '../lib/fitScreen';
import { getReading, speak, toSpeech, useReadIndex } from '../lib/speech';
import { checkStep, completeExam, earnSticker, getState, markPracticed, useProgress, useSettings } from '../lib/store';
import { Practice } from '../practice/Practice';
import { useTapGuard } from '../lib/tapGuard';
import { order, type Goto } from './common';

/** 문장을 다 읽고 미리 알아 두기 카드를 읽기 전 쉼 */
const SENSE_GAP_MS = 400;

export function StepPage({ exam, index, goto }: { exam: ExamContent; index: number; goto: Goto }) {
  const step = exam.steps[index];
  const next = exam.steps[index + 1];
  const progress = useProgress(exam.id);
  const { readAloud, hideNeedle, practiceGate } = useSettings();
  const fill = useFill();
  const [toast, setToast] = useState<Phase | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const doneBtn = useRef<HTMLButtonElement>(null);
  const practiceBox = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const senseList = useRef<HTMLDivElement>(null);
  const guard = useTapGuard();
  // 세로 태블릿에서 사진을 줄여도 넘치면 화면 전체를 살짝 줄임 (lib/fitScreen.ts)
  useFitToScreen(body, step.id);

  const practiced = progress.practiced.includes(step.id);
  // 보호자 메뉴로 연습 기록을 지우면(했던 연습이 다시 "안 함") 연습 칸도 처음 상태로 → 다시 해내면 "했어요"가 켜짐.
  // 그대로 두면 성공 글이 남은 채 잠기고, 다시 성공해도 연습이 "이미 알렸음"이라 갇혔음 (2026-10-07 검수)
  const [practiceRound, setPracticeRound] = useState(0);
  const wasPracticed = useRef(practiced);
  useEffect(() => {
    if (wasPracticed.current && !practiced) setPracticeRound((r) => r + 1);
    wasPracticed.current = practiced;
  }, [practiced]);
  /** 스티커 창이 떠 있는 동안 연습 칸을 내려놓을 때 그 자리 높이 (뒤 화면이 출렁이지 않게) */
  const [practiceHold, setPracticeHold] = useState(0);
  const needsPractice = !!step.practice && !practiced;
  // 연습을 해내야 "했어요"가 켜짐 (보호자 메뉴에서 끌 수 있음). 잠겨 있을 때 누르면 실패 표시 없이 연습 칸으로 안내
  const locked = practiceGate && needsPractice;
  // 시선 유도 대상: 연습이 남았으면 연습 영역, 아니면 "했어요"
  useGuide(needsPractice ? practiceBox : doneBtn, `${step.id}:${needsPractice}`);

  const speechText = step.speech
    ? fill(step.speech)
    : toSpeech(plain(fill(step.text)), step.sub && fill(step.sub));

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    // 페이지에 들어설 때 한 번 읽어 줌 (보호자 메뉴에서 끌 수 있음): 문장 → 미리 알아 두기 카드를 차례로. 끝까지 다 읽으면 바로 빛 고리.
    // 감각 안내(차가움·따끔·소리)를 듣지 않고 "했어요"로 넘어가지 않게 (2026-10-06 최종 검토). 카드를 읽을 때 폰에서 아래 버튼 뒤면 보이게 스크롤.
    // 카드 문장은 카드의 들어보기와 같은 문장 → 그 버튼도 같이 움직임
    if (!readAloud) return;
    const queue = [
      { text: speechText, audio: step.audio, card: -1 },
      ...(step.sensory ?? []).map((s, card) => ({ text: fill(s.text), audio: undefined, card })),
    ];
    let timer = 0;
    // 아이가 연습을 누르기 시작하면 남은 카드는 읽지 않음 (쉬는 사이에 시작한 이름 부르기가 카드 읽기에 끊겼음, 10-07 검수)
    let stopped = false;
    const box = practiceBox.current;
    const interrupt = () => {
      stopped = true;
      window.clearTimeout(timer);
    };
    box?.addEventListener('pointerdown', interrupt, true);
    box?.addEventListener('keydown', interrupt, true);
    const say = (i: number) => {
      const { text, audio, card } = queue[i];
      const last = i === queue.length - 1;
      const cardEl = card >= 0 ? senseList.current?.children[card] : null;
      if (cardEl instanceof HTMLElement) fx.reveal(cardEl);
      speak(text, {
        audio,
        cue: last,
        onEnd: (finished) => {
          // 읽는 중에 보호자 메뉴에서 자동 읽기를 끄면 다음 카드는 안 읽음
          if (finished && !last && getState().settings.readAloud)
            timer = window.setTimeout(() => {
              // 그사이 다른 말(연습 안내 등)이 나오고 있으면 카드는 그만 읽음
              if (!stopped && !getReading()) say(i + 1);
            }, SENSE_GAP_MS);
        },
      });
    };
    say(0);
    return () => {
      window.clearTimeout(timer);
      box?.removeEventListener('pointerdown', interrupt, true);
      box?.removeEventListener('keydown', interrupt, true);
    };
    // 페이지가 바뀔 때만 (문장이 같아도 다시 읽지 않음)
  }, [step.id]);

  // 읽어 주는 중이면 읽은 글자가 차례로 검사 색으로 바뀜. 따로 쓴 읽기 원고(step.speech)는 화면 글과 달라서 안 함
  const readIndex = useReadIndex(speechText);
  const reading = readIndex !== null && !step.speech;
  const actionLength = plain(fill(step.text)).length;

  const advance = () => goto(1);

  const onDone = () => {
    if (toast) return; // 스티커 창이 떠 있는 동안 또 누름
    if (locked) {
      const still = document.documentElement.dataset.reduceMotion === 'on';
      practiceBox.current?.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
      fx.promptNow(); // 빛 고리를 바로 연습 칸에
      devEvent('연습 전에 했어요 → 연습 칸으로 안내');
      return;
    }
    // 스티커·마친 횟수는 단계를 실제로 다 했을 때만. 예전에는 묶음(검사)의 마지막 단계만 누르면 줘서,
    // 보호자 메뉴 "단계 고르기"로 건너뛰고 마지막만 눌러도 스티커가 붙고 첫 화면 카드가 "다 했어요"가 됐음 (2026-10-07 버그)
    const firstTime = !progress.checked.includes(step.id);
    const checkedNow = firstTime ? [...progress.checked, step.id] : progress.checked;
    // 마친 횟수: 이번 회차에 이 누름으로 모든 단계가 처음 다 찼을 때만 (스티커판에서 뒤로 왔다 다시 눌러도 늘지 않게)
    if (firstTime && exam.steps.every((s) => checkedNow.includes(s.id))) {
      completeExam(exam.id);
      devEvent(`${exam.title} 연습 완료`);
    }
    checkStep(exam.id, step.id);
    devEvent(`${index + 1}단계 했어요: ${plain(fill(step.text))}`);
    // 스티커: 그 묶음의 단계를 모두 했을 때 (차례대로면 묶음 마지막 단계에서, 건너뛴 단계를 나중에 채우면 그때)
    const phase = exam.phases.find((p) => p.id === step.phase);
    const phaseDone = exam.steps.filter((s) => s.phase === step.phase).every((s) => checkedNow.includes(s.id));
    if (phaseDone && phase && !progress.stickers.includes(phase.id)) {
      earnSticker(exam.id, phase.id);
      devEvent(`스티커 받음: ${phase.title}`);
      // 스티커 창: 누르지 않아도 잠깐 뒤 저절로 닫히고 다음으로 (components/StickerToast).
      // 창이 떠 있는 동안 연습은 내려놓음 → 숫자 세기·시범·이름 부르기가 창 뒤에서 칭찬 말을 끊지 않게 (2026-10-07 검수)
      setPracticeHold(practiceBox.current?.offsetHeight ?? 0);
      setToast(phase);
      return;
    }
    advance();
  };

  return (
    <div className="screen">
      <TopBar exam={exam} step={step} />
      <div ref={body} className={`screen__body screen__body--split${step.practice ? ' screen__body--practice' : ''}`}>
        <div className="reveal" style={order(0)}>
          <Progress exam={exam} index={index} checked={progress.checked} />
        </div>

        <Photo
          className="reveal"
          style={order(1)}
          src={step.image}
          alt={fill(step.imageAlt)}
          hidden={!!step.sensitive && hideNeedle}
          ratio={step.practice ? '16 / 9' : '4 / 3'} // 연습이 있으면 사진을 낮춰 연습이 한눈에 보이게
          // 사진 위 단계 번호는 뺌: 묶음 칩·"N / 전체"와 번호가 셋이 되어 헷갈렸음, 시안 m4에도 없음 (2026-10-07 간략화)
          view={step.imageView}
          field={{ file: `exams/${exam.id}.json`, image: `/steps/${index}/image`, view: `/steps/${index}/imageView` }}
        />

        {/* 세로: 그대로 (display: contents). 가로: 사진 오른쪽 한 줄로 묶임 — base.css "가로 화면" */}
        <div className="split-side">
          <div className={`say reveal${reading ? " reading" : ""}`} style={order(2)}>
            <div>
              <h1 ref={heading} tabIndex={-1} className="say__action">
                <RichText text={step.text} read={reading ? readIndex : undefined} />
              </h1>
              {step.sub && (
                <p className="say__sub">
                  <ReadText text={fill(step.sub)} read={reading ? Math.max(0, readIndex - actionLength - 1) : undefined} />
                </p>
              )}
            </div>
            <SpeakButton text={speechText} audio={step.audio} />
          </div>

          {!!step.sensory?.length && (
            <section className="reveal" style={order(3)}>
              <h2 className="section-title">
                <Icon name="eye" /> 미리 알아 두기
              </h2>
              <div ref={senseList} className="sense-list">
                {step.sensory.map((s, i) => (
                  <SenseCard key={i} sense={s} />
                ))}
              </div>
            </section>
          )}

          {step.practice && (
            <section ref={practiceBox} className="reveal" style={order(4)}>
              {toast ? (
                <div style={{ height: practiceHold }} aria-hidden="true" />
              ) : (
                <>
                  <h2 className="section-title">
                    <Icon name="hand" /> 연습해 봐요
                  </h2>
                  <Practice key={practiceRound} data={step.practice} onSuccess={() => markPracticed(exam.id, step.id)} />
                </>
              )}
            </section>
          )}

          <p className="next-up reveal" style={order(5)}>
            <Icon name="next" />
            다음: <b>{next ? plain(fill(next.text)) : '칭찬 스티커판'}</b>
          </p>
        </div>
      </div>

      <div className="bottom-bar">
        <button type="button" className="btn btn--back" onClick={guard(() => goto(-1))} aria-label="이전">
          <Icon name="back" />
        </button>
        <button
          ref={doneBtn}
          type="button"
          className="btn btn--done"
          data-ready={practiced}
          data-locked={locked}
          aria-disabled={locked}
          onClick={guard(onDone)}
        >
          <Icon name={locked ? 'hand' : 'check'} />
          {locked ? '먼저 해 봐요' : practiced ? '연습했어요' : '했어요'}
        </button>
      </div>

      {toast && (
        <StickerToast
          phase={toast}
          onDone={() => {
            setToast(null);
            advance();
          }}
        />
      )}

    </div>
  );
}
