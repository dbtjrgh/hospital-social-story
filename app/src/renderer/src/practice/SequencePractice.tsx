// "순서 고르기" 연습 (PDF 정맥주사: 주사 과정의 순서를 선택하기).
// 들어서면 바로 카드를 빈칸으로 끌어다 놓음. 먼저 놓을 카드와 들어갈 칸이 늘 노란 테두리로 빛남
// (본인 요청 2026-10-07: 뭘 놔야 하는지 바로바로 / 시범("순서 보기")은 없이 바로 노란 테두리로 — 그 전의 "보여 주고 따라 하기"를 대신함).
// 카드를 눌러도 들어감 (손 움직임이 어려운 아이도 가능, 패드 붙이기와 같음).
// 오류 없는 학습: 차례가 아닌 카드는 들어가지 않고 제자리로 (실패 소리·빨간 표시 없음, "다음은 ○○예요"만).
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { SensoryKind } from '../content/types';
import { Icon, SENSE_ICON } from '../components/Icon';
import { SpeakButton } from '../components/SpeakButton';
import { fx } from '../fx/fx';
import { devEvent } from '../lib/devlog';
import { hasBatchim } from '../lib/josa';
import { playSynth } from '../lib/sound';
import { speak } from '../lib/speech';

interface Item {
  label: string;
  /** 카드 그림 (감각 아이콘을 같이 씀) */
  kind?: SensoryKind;
}

interface Props {
  items: Item[];
  prompt: string;
  success: string;
  onSuccess: () => void;
}

/** 이만큼(px) 움직여야 끌기로 봄. 덜 움직이고 떼면 그냥 누름 → 카드가 들어감 */
const DRAG_START_PX = 8;
/** 칸 목록 둘레로 이만큼(px) 밖에 놓아도 들어감 → 정확히 맞히지 않아도 됨 */
const DROP_MARGIN = 24;
const MISS_MSG = '위의 빈칸에 놓아 봐요. 카드를 눌러도 들어가요.';

/** 끌고 있는 카드 (연습 상자 기준 px, w = 카드 너비) */
interface Ghost {
  index: number;
  x: number;
  y: number;
  w: number;
}

/** 카드 이름 "주사 바늘 넣기 (따끔)" → 문장 안에서는 괄호를 뺌, 읽을 때는 쉼표로 */
const plainLabel = (label: string) => label.replace(/\s*\(.*\)\s*$/, '');
const spokenLabel = (label: string) => label.replace(/\s*\((.+)\)\s*$/, ', $1');

/** 늘 같은 모양으로 섞기 (화면마다 바뀌지 않게). 우연히 맞는 순서가 되면 뒤집음 */
function shuffledOrder(items: Item[]): number[] {
  const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 9973, 7);
  const order = items.map((_, i) => i).sort((a, b) => hash(items[a].label) - hash(items[b].label));
  return order.every((v, i) => v === i) ? order.reverse() : order;
}

export function SequencePractice({ items, prompt, success, onSuccess }: Props) {
  /** 칸에 들어간 개수 = 다음 카드 번호 */
  const [picked, setPicked] = useState(0);
  const done = picked === items.length;
  /** "다시 해 보기"를 누른 횟수 (그때만 카드가 보이게 스크롤 — 들어설 때는 화면을 움직이지 않음) */
  const [retries, setRetries] = useState(0);
  /** 차례가 아닌 카드를 누르거나 끌어 놓음 → 다음 카드 이름을 알려 줌 */
  const [hint, setHint] = useState(false);
  /** 맞는 카드를 칸 밖에 놓음 → 어디에 놓는지 알려 줌 */
  const [missed, setMissed] = useState(false);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const slots = useRef<HTMLOListElement>(null);
  const cards = useRef<HTMLDivElement>(null);
  const succeeded = useRef(false);
  /** 누르고 있는 카드 (상태보다 먼저 바뀌어야 해서 ref) */
  const press = useRef<{ index: number; x: number; y: number; w: number; moved: boolean } | null>(null);
  /** 끌어 놓은 뒤 따라오는 click 은 무시 (그냥 누름과 두 번 세지 않게) */
  const skipClick = useRef(false);
  const order = useMemo(() => shuffledOrder(items), [items]);

  // 다시 해 보기: 카드가 아래 버튼 줄 뒤에 가리지 않게 (폰: 칸과 카드를 같이 보며 끌 수 있게)
  useEffect(() => {
    if (retries > 0 && cards.current) fx.reveal(cards.current);
  }, [retries]);

  /** 화면 좌표 → 연습 상자 안 좌표. 화면을 살짝 줄였을 때(lib/fitScreen.ts) 보이는 크기 → 원래 크기로 바꿈 */
  const toBox = (clientX: number, clientY: number) => {
    const el = box.current!;
    const r = el.getBoundingClientRect();
    const scale = el.offsetWidth / r.width || 1;
    return { x: (clientX - r.left) * scale, y: (clientY - r.top) * scale, scale };
  };

  const choose = (index: number) => {
    if (done || index < picked) return;
    if (index !== picked) {
      setHint(true);
      setMissed(false);
      devEvent(`연습: 순서 다시 안내 (${items[index].label})`);
      return;
    }
    const next = picked + 1;
    setPicked(next);
    setHint(false);
    setMissed(false);
    playSynth('tick', 0.6);
    speak(spokenLabel(items[index].label));
    if (next === items.length) {
      playSynth('chime');
      if (box.current) fx.celebrate(box.current, 8);
      if (!succeeded.current) {
        succeeded.current = true;
        devEvent(`연습 성공: 순서 ${items.length}개`);
        onSuccess();
      }
    }
  };

  /** 놓은 곳이 칸 목록 위인지 (둘레 DROP_MARGIN 까지) — 어느 칸에 놓아도 다음 빈칸에 들어감 */
  const overSlots = (clientX: number, clientY: number) => {
    const r = slots.current?.getBoundingClientRect();
    return (
      !!r &&
      clientX >= r.left - DROP_MARGIN &&
      clientX <= r.right + DROP_MARGIN &&
      clientY >= r.top - DROP_MARGIN &&
      clientY <= r.bottom + DROP_MARGIN
    );
  };

  const onCardDown = (index: number) => (e: PointerEvent<HTMLButtonElement>) => {
    skipClick.current = false;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 캡처가 막혀도 끌기는 됨
    }
    const r = e.currentTarget.getBoundingClientRect();
    press.current = { index, x: e.clientX, y: e.clientY, w: r.width * toBox(0, 0).scale, moved: false };
  };
  const onCardMove = (e: PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p) return;
    if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_START_PX) return;
    p.moved = true;
    const { x, y } = toBox(e.clientX, e.clientY);
    setGhost({ index: p.index, x, y, w: p.w });
  };
  const onCardUp = (e: PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    press.current = null;
    if (!p?.moved) return; // 그냥 누름 → onClick 에서
    setGhost(null);
    skipClick.current = true;
    // 차례가 아닌 카드는 어디에 놓든 "다음은 ○○예요", 맞는 카드는 칸 위에 놓으면 들어감
    if (p.index !== picked || overSlots(e.clientX, e.clientY)) choose(p.index);
    else {
      setMissed(true);
      setHint(false);
      devEvent('연습: 순서 카드를 칸 밖에 놓음 → 다시 안내');
    }
  };
  const onCardCancel = () => {
    press.current = null;
    setGhost(null);
  };
  const onCardClick = (index: number) => () => {
    if (skipClick.current) {
      skipClick.current = false;
      return;
    }
    choose(index);
  };

  const tryAgain = () => {
    setPicked(0);
    setHint(false);
    setMissed(false);
    setRetries((n) => n + 1);
  };

  // 카드 이름이 "따끔"처럼 동사가 아니어도 자연스럽게: "처음은 고무줄 묶기예요." / "다음은 주사 바늘 넣기예요."
  const nextLabel = plainLabel(items[Math.min(picked, items.length - 1)].label);
  const hintText = `${picked === 0 ? '처음은' : '다음은'} ${nextLabel}${hasBatchim(nextLabel) ? '이에요' : '예요'}.`;
  const message = done ? success : hint ? hintText : missed ? MISS_MSG : prompt;
  const ghostItem = ghost ? items[ghost.index] : null;

  return (
    <div className="practice" ref={box} aria-live="polite">
      <div className="practice__say">
        <p className="practice__msg" data-tone={done ? 'good' : hint || missed ? 'calm' : undefined}>
          {message}
        </p>
        <SpeakButton text={message} compact />
      </div>

      {/* 위: 순서 칸 1~N. 다음에 들어갈 칸이 노란 테두리 */}
      <ol ref={slots} className="seq__slots" aria-label="고른 순서">
        {items.map((item, i) => (
          <li key={item.label} className="seq__slot" data-filled={i < picked} data-next={i === picked}>
            <span className="seq__num">{i + 1}</span>
            {i < picked ? (
              <span className="seq__slot-label">
                {item.kind && <Icon name={SENSE_ICON[item.kind]} />}
                {item.label}
              </span>
            ) : (
              <span className="seq__slot-empty" role="img" aria-label="빈칸" />
            )}
          </li>
        ))}
      </ol>

      {/* 아래: 섞인 카드. 다음에 놓을 카드가 노란 테두리 */}
      {!done && (
        <div ref={cards} className="seq__cards">
          {order.map((i) => {
            const used = i < picked;
            return (
              <button
                key={items[i].label}
                type="button"
                className="seq__card"
                data-hint={i === picked}
                data-lifted={ghost?.index === i}
                disabled={used}
                aria-label={used ? `${items[i].label} (골랐어요)` : items[i].label}
                onPointerDown={onCardDown(i)}
                onPointerMove={onCardMove}
                onPointerUp={onCardUp}
                onPointerCancel={onCardCancel}
                onKeyDown={() => (skipClick.current = false)}
                onClick={onCardClick(i)}
              >
                {items[i].kind && <Icon name={SENSE_ICON[items[i].kind!]} />}
                <span>{items[i].label}</span>
              </button>
            );
          })}
        </div>
      )}

      {ghost && ghostItem && (
        <span className="seq__drag" style={{ left: ghost.x, top: ghost.y, width: ghost.w }} aria-hidden="true">
          {ghostItem.kind && <Icon name={SENSE_ICON[ghostItem.kind]} />}
          <span>{ghostItem.label}</span>
        </span>
      )}

      {done && (
        <button type="button" className="btn--line" onClick={tryAgain}>
          다시 해 보기
        </button>
      )}
    </div>
  );
}
