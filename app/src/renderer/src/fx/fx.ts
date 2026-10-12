// PixiJS 연출 엔진: 앱 틀 위에 캔버스 1장을 겹쳐 시선 유도·하이라이트·칭찬 연출을 그립니다.
// 글자·버튼은 React(DOM)가 맡고, 여기서는 그림 효과만 그립니다 (pointer-events: none).
//
// 시선 유도는 "단계적 촉구": 15초 동안 아무것도 안 누르면 빛 고리 → 30초면 손가락 안내 (3번 누르는 동작 뒤 사라짐).
// 어떤 입력이든 들어오면 바로 사라지고 다시 셉니다. 읽어 주는 중·연습 중에는 세지 않고, 끝난 뒤부터 셉니다
// (촉구가 압박이 되어 읽지 않고 누르게 만들지 않도록).
// 읽어 주기가 끝까지 끝나면 기다리지 않고 바로 빛 고리 → 15초 뒤 손가락 ("다 들었으면 이제 여기", 2026-10-06).
// 지금 고리·손가락·스포트라이트가 어디 있는지 DOM 에도 data-fx-guide / data-fx-spot 으로 남김
// (캔버스는 개발 패널 "화면 보기"에 안 찍혀서 그쪽이 이 표시로 대신 그림, 자동 점검도 이걸로 확인).
// 자극 줄이기: 느린 이징, 초당 1회 미만의 숨쉬듯 밝아짐(깜빡임 없음), 파스텔색, 움직임 줄이기면 정지 표시.
import { Application, Container, Graphics } from 'pixi.js';

const RING_AFTER_MS = 15000;
const HAND_AFTER_MS = 30000;
/** 손가락이 "톡" 누르는 동작 한 번의 길이와 횟수. 그 뒤엔 빛 고리만 남음 */
const HAND_CYCLE_S = 2.4;
const HAND_TIMES = 3;
const COLORS = { ring: 0xffb703, ringSoft: 0xffd166, veil: 0xf5faff, ink: 0x16325c };
/**
 * 빛 고리 선은 보이는 모양 끝에 딱 붙음 (2026-10-06 본인 지적 "완전 타이트하게"): 선 두께의 절반만큼만 바깥 → 선 안쪽 끝이 모양 끝에 닿음.
 * 부드러운 빛(RING_HALO)은 선 바깥에만
 */
const RING_LINE = 3.5;
const RING_PAD = RING_LINE / 2;
const RING_HALO = 6;
/**
 * 빛 고리 움직임 (2026-10-06 본인 요청 "움직이게"): 선은 제자리, 2초에 한 번 바깥 빛이 숨쉬듯 RING_BREATH 만큼 더 퍼졌다 돌아오고,
 * 가장 안쪽일 때 옅은 물결이 RING_RIPPLE 만큼 퍼지며 사라짐. 초당 0.5번이라 깜빡임 아님.
 * 가장 커져도 빛은 카드 사이 틈(14px) 안 → 옆 카드에 안 걸림
 */
const RING_BREATH = 4;
const RING_RIPPLE = 18;
const RING_PERIOD_S = 2;
/** 연습 스포트라이트 구멍과 연습 상자 사이 간격 */
const SPOT_PAD = 10;
const STAR_COLORS = [0xffd166, 0xffe7a3, 0xbfe0ff, 0xc8f0dc, 0xffd3e0];

const HAND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M20 4c3.3 0 6 2.7 6 6v18l3-1.2c3-1.1 6.2.6 7 3.6l3.5-.8c3-.6 5.8 1.2 6.4 4.1l2.2.2c2.9.3 5 2.8 4.8 5.7l-1 13c-.6 7.8-7.1 13.8-14.9 13.8h-8.6c-4.8 0-9.3-2.3-12.1-6.2l-9.6-13.3c-1.8-2.5-1.2-6 1.3-7.7 2.4-1.7 5.7-1.2 7.6 1l3.6 4.3V10c0-3.3 2.7-6 6-6z" fill="#ffffff" stroke="#16325c" stroke-width="3" stroke-linejoin="round"/></svg>`;

type Star = { g: Graphics; vx: number; vy: number; spin: number; life: number; max: number };

class FxEngine {
  private app: Application | null = null;
  private host: HTMLElement | null = null;
  private frame: HTMLElement | null = null;
  private ready = false;
  private reduceMotion = false;

  // 그림 객체는 attach 때마다 새로 만듦 (개발 중 다시 붙을 때 파괴된 객체를 쓰지 않게)
  private ringG = new Graphics();
  private veilG = new Graphics();
  private hand = new Container();
  private stars: Star[] = [];
  private starLayer = new Container();

  private guideEl: HTMLElement | null = null;
  /** data-fx-guide 를 붙여 둔 요소 (목표가 바뀌면 앞 요소에서 지움) */
  private markedEl: HTMLElement | null = null;
  private spotEl: HTMLElement | null = null;
  private ringOn = false;
  private handOn = false;
  private handT = 0;
  private handEnabled = true;
  /** 촉구를 멈추는 이유 (읽어 주는 중 'speech', 연습 중 'practice'). 하나라도 있으면 세지 않음 */
  private pauses = new Set<string>();
  private veilAlpha = 0;
  private timers: number[] = [];
  private t = 0;
  /** 겹쳐 뜬 창(스티커·보호자 메뉴) 수. 열려 있으면 시선 유도를 멈춤 */
  private modal = 0;

  async attach(frame: HTMLElement, host: HTMLElement): Promise<void> {
    if (this.app) return;
    this.frame = frame;
    this.host = host;
    const app = new Application();
    this.app = app;
    await app.init({
      resizeTo: host,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoStart: false,
    });
    if (this.app !== app) {
      app.destroy(true);
      return; // 기다리는 사이 detach 됨
    }
    host.appendChild(app.canvas);
    this.ringG = new Graphics();
    this.veilG = new Graphics();
    this.hand = new Container();
    this.starLayer = new Container();
    this.stars = [];
    app.stage.addChild(this.veilG, this.ringG, this.starLayer, this.hand);
    try {
      const g = new Graphics().svg(HAND_SVG);
      g.pivot.set(20, 4); // 손가락 끝이 기준점
      g.scale.set(1.25);
      this.hand.addChild(g);
    } catch {
      this.hand.addChild(new Graphics().circle(0, 0, 14).fill({ color: COLORS.ring, alpha: 0.9 }));
    }
    this.hand.visible = false;
    app.ticker.add(this.update);
    frame.addEventListener('pointerdown', this.onActivity, true);
    frame.addEventListener('keydown', this.onActivity, true);
    this.ready = true;
    this.restartGuideTimer();
  }

  detach(): void {
    this.frame?.removeEventListener('pointerdown', this.onActivity, true);
    this.frame?.removeEventListener('keydown', this.onActivity, true);
    this.clearTimers();
    const app = this.app;
    this.app = null;
    // 초기화 중이면 attach 쪽에서 스스로 정리함
    if (app && this.ready) app.destroy(true, { children: true });
    this.ready = false;
  }

  setReduceMotion(on: boolean): void {
    this.reduceMotion = on;
  }

  /** 보호자 설정 "손가락 안내". 끄면 빛 고리까지만 */
  setHandEnabled(on: boolean): void {
    this.handEnabled = on;
    if (!on) {
      this.hand.visible = this.handOn = false;
      this.mark();
    }
  }

  /** 촉구 멈춤/다시 셈. 끝나면 그때부터 처음부터 셈 */
  setPaused(reason: string, on: boolean): void {
    if (on === this.pauses.has(reason)) return;
    if (on) this.pauses.add(reason);
    else this.pauses.delete(reason);
    this.hidePrompts();
    this.restartGuideTimer();
  }

  /** 지금 안내하는 곳 (잠깐 다른 곳을 안내했다가 되돌릴 때) */
  getGuide(): HTMLElement | null {
    return this.guideEl;
  }

  /** 다음에 누를 곳 (없으면 null). 오래 멈추면 빛 고리 → 손가락 */
  setGuide(el: HTMLElement | null): void {
    this.guideEl = el;
    this.hidePrompts();
    this.restartGuideTimer();
  }

  /** 읽어 주기가 끝까지 끝남 → 기다리지 않고 바로 빛 고리, 15초 뒤 손가락 */
  promptNow(): void {
    this.clearTimers();
    if (!this.guideEl || this.modal > 0 || this.pauses.size > 0) return;
    this.showRing();
    this.scheduleHand(HAND_AFTER_MS - RING_AFTER_MS);
  }

  /** 연습 영역만 밝게 두고 나머지는 밝은 베일로 살짝 가림 */
  setSpotlight(el: HTMLElement | null): void {
    if (this.spotEl && this.spotEl !== el) delete this.spotEl.dataset.fxSpot;
    if (el) el.dataset.fxSpot = '';
    this.spotEl = el;
    this.setPaused('practice', !!el);
    this.wake();
  }

  /** 겹쳐 뜨는 창이 열리고 닫힐 때 */
  setModal(open: boolean): void {
    this.modal = Math.max(0, this.modal + (open ? 1 : -1));
    this.hidePrompts();
    this.restartGuideTimer();
  }

  /** 칭찬: 별 몇 개가 천천히 떠오름 */
  celebrate(el: Element, count = 9): void {
    if (!this.ready || this.reduceMotion) return;
    const r = this.rectOf(el);
    if (!r) return;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    for (let i = 0; i < count; i++) {
      const size = 7 + Math.random() * 7;
      const g = new Graphics()
        .star(0, 0, 5, size, size * 0.5)
        .fill({ color: STAR_COLORS[i % STAR_COLORS.length] })
        .stroke({ width: 1.5, color: 0xffffff, alpha: 0.9 });
      g.position.set(cx + (Math.random() - 0.5) * r.w * 0.6, cy + (Math.random() - 0.5) * r.h * 0.3);
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const speed = 45 + Math.random() * 55; // px/초 — 천천히
      this.starLayer.addChild(g);
      this.stars.push({ g, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, spin: (Math.random() - 0.5) * 1.5, life: 0, max: 1.4 + Math.random() * 0.6 });
    }
    this.wake();
  }

  private onActivity = () => {
    this.hidePrompts();
    this.restartGuideTimer();
  };

  private hidePrompts() {
    this.ringOn = false;
    this.handOn = false;
    this.ringG.clear();
    this.hand.visible = false;
    this.mark();
    this.wake();
  }

  private clearTimers() {
    this.timers.forEach((id) => window.clearTimeout(id));
    this.timers = [];
  }

  private restartGuideTimer() {
    this.clearTimers();
    if (!this.guideEl || this.modal > 0 || this.pauses.size > 0) return;
    this.timers.push(window.setTimeout(() => this.showRing(), RING_AFTER_MS));
    this.scheduleHand(HAND_AFTER_MS);
  }

  private showRing() {
    this.ringOn = true;
    this.t = 0;
    this.revealGuide();
    this.mark();
    this.wake();
  }

  /** ms 뒤 손가락이 3번 "톡" 누르고 사라짐 (빛 고리는 남음) */
  private scheduleHand(ms: number) {
    this.timers.push(
      window.setTimeout(() => {
        if (!this.handEnabled) return;
        this.handOn = true;
        this.handT = 0;
        this.mark();
        this.wake();
      }, ms),
      // 끝내기는 실제 시간으로 (프레임이 느려지거나 멈춰도 제때 사라지게)
      window.setTimeout(() => {
        this.handOn = false;
        this.mark();
        this.wake();
      }, ms + HAND_CYCLE_S * HAND_TIMES * 1000),
    );
  }

  /** 고리·손가락 상태를 목표 요소의 data-fx-guide 로 ("ring" | "hand", 없으면 지움) */
  private mark() {
    if (this.markedEl && this.markedEl !== this.guideEl) delete this.markedEl.dataset.fxGuide;
    this.markedEl = this.guideEl;
    if (!this.guideEl) return;
    const state = this.handOn ? 'hand' : this.ringOn ? 'ring' : '';
    if (state) this.guideEl.dataset.fxGuide = state;
    else delete this.guideEl.dataset.fxGuide;
  }

  private wake() {
    if (this.app && this.ready && !this.app.ticker.started) this.app.ticker.start();
  }

  private rectOf(el: Element | null) {
    if (!el || !this.host || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    const h = this.host.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { x: r.left - h.left, y: r.top - h.top, w: r.width, h: r.height };
  }

  /**
   * 눈에 보이는 모양: 상자 + 아래 입체 그림자(블러 없는 box-shadow, 예: 버튼의 0 6px 0) + 실제 모서리 둥글기.
   * 상자만 감싸면 입체 버튼에서 고리가 위로 쏠려 보임.
   */
  private shapeOf(el: HTMLElement | null) {
    const rect = this.rectOf(el);
    if (!rect || !el) return null;
    const cs = getComputedStyle(el);
    const radius = cs.borderTopLeftRadius.endsWith('%')
      ? (parseFloat(cs.borderTopLeftRadius) / 100) * Math.min(rect.w, rect.h)
      : parseFloat(cs.borderTopLeftRadius) || 0;
    const h = rect.h + solidDrop(cs.boxShadow);
    // 모서리가 없는 상자(예: 연습 영역 section)는 고리가 각져 보이지 않게 조금 둥글게
    return { ...rect, h, r: Math.min(radius > 0 ? radius : 16, h / 2, rect.w / 2) };
  }

  /** 고리를 켤 때 목표가 가려져 있으면 보이게 함 */
  private revealGuide() {
    if (this.guideEl) this.reveal(this.guideEl, RING_PAD + 12);
  }

  /**
   * el 이 스크롤 영역 밖이나 아래 고정 막대(.bottom-bar) 뒤에 있으면 부드럽게 보이게 함
   * (빛 고리 대상, 연습 뒤 느낌 상자, 읽어 주는 감각 카드)
   */
  reveal(el: HTMLElement, margin = 12): void {
    if (!el.isConnected) return;
    const scroller = scrollParent(el);
    if (!scroller) return;
    const view = scroller.getBoundingClientRect();
    let bottom = view.bottom;
    const bar = scroller.querySelector('.bottom-bar');
    if (bar && !bar.contains(el)) bottom = Math.min(bottom, bar.getBoundingClientRect().top);
    const r = el.getBoundingClientRect();
    let dy = 0;
    if (r.bottom + margin > bottom) dy = r.bottom + margin - bottom;
    if (r.top - margin < view.top + dy) dy = r.top - margin - view.top; // 위가 잘리면 위를 우선
    if (Math.abs(dy) > 1) scroller.scrollBy({ top: dy, behavior: this.reduceMotion ? 'auto' : 'smooth' });
  }

  private update = () => {
    const app = this.app;
    if (!app) return;
    const dt = Math.min(app.ticker.deltaMS / 1000, 0.05);
    this.t += dt;
    let busy = false;

    const { width, height } = app.screen;

    // 스포트라이트 베일 (구멍도 실제 모양에 맞춰 같은 간격·같은 중심의 모서리로)
    const targetAlpha = this.spotEl && this.modal === 0 ? 0.55 : 0;
    this.veilAlpha += (targetAlpha - this.veilAlpha) * Math.min(1, dt * (this.reduceMotion ? 60 : 5));
    this.veilG.clear();
    const spot = this.shapeOf(this.spotEl);
    if (this.veilAlpha > 0.01) {
      this.veilG.rect(0, 0, width, height).fill({ color: COLORS.veil, alpha: this.veilAlpha });
      if (spot) this.veilG.roundRect(spot.x - SPOT_PAD, spot.y - SPOT_PAD, spot.w + SPOT_PAD * 2, spot.h + SPOT_PAD * 2, spot.r + SPOT_PAD).cut();
      busy ||= Math.abs(targetAlpha - this.veilAlpha) > 0.01 || !!this.spotEl;
    }

    // 빛 고리: 보이는 모양 끝에 딱 붙고, 모서리는 같은 중심 → 어떤 버튼·카드에도 같은 모양으로 딱 맞음.
    // 바깥 빛이 숨쉬듯 퍼졌다 돌아오고(RING_BREATH), 가장 안쪽일 때 옅은 물결이 퍼짐(RING_RIPPLE). 화면 밖으로 나가면 안쪽으로 붙임
    this.ringG.clear();
    const target = this.rectOf(this.guideEl);
    const shape = this.ringOn ? this.shapeOf(this.guideEl) : null;
    if (shape) {
      const edge = RING_HALO / 2;
      const outline = (pad: number) => {
        const x0 = Math.max(shape.x - pad, edge);
        const y0 = Math.max(shape.y - pad, edge);
        const x1 = Math.min(shape.x + shape.w + pad, width - edge);
        const y1 = Math.min(shape.y + shape.h + pad, height - edge);
        return [x0, y0, x1 - x0, y1 - y0, Math.min(shape.r + pad, (x1 - x0) / 2, (y1 - y0) / 2)] as const;
      };
      const phase = (this.t % RING_PERIOD_S) / RING_PERIOD_S; // 0 → 1
      // 움직임 줄이기: 멈춘 고리만
      const breath = this.reduceMotion ? 0 : 0.5 - 0.5 * Math.cos(phase * Math.PI * 2); // 0 → 1 → 0, 부드럽게
      if (!this.reduceMotion) {
        const spread = 1 - (1 - phase) ** 3; // 처음엔 빠르게, 끝으로 갈수록 천천히
        this.ringG
          .roundRect(...outline(RING_PAD + spread * RING_RIPPLE))
          .stroke({ width: 3, color: COLORS.ring, alpha: 0.6 * (1 - phase) ** 1.5 });
      }
      const glow = RING_HALO + breath * RING_BREATH; // 선 바깥 빛의 두께 6 → 10px (모양 끝에서 가장 멀리 13.5px)
      this.ringG
        .roundRect(...outline(RING_PAD + RING_LINE / 2 + glow / 2))
        .stroke({ width: glow, color: COLORS.ringSoft, alpha: 0.22 + breath * 0.1 })
        .roundRect(...outline(RING_PAD))
        .stroke({ width: RING_LINE, color: COLORS.ring, alpha: 0.85 + breath * 0.15 });
      busy = true;
    }

    // 손가락 안내: 버튼 가운데를 천천히 "톡" 누르는 동작 (2.4초에 한 번, 3번 뒤 사라짐)
    if (this.handOn) this.handT += dt;
    if (this.handOn && target) {
      const cx = target.x + target.w / 2;
      const cy = target.y + target.h / 2;
      const cycle = this.reduceMotion ? 0.5 : (this.handT % HAND_CYCLE_S) / HAND_CYCLE_S;
      const press = cycle < 0.5 ? easeInOut(cycle / 0.5) : 1 - easeInOut((cycle - 0.5) / 0.5);
      this.hand.visible = true;
      this.hand.position.set(cx + 34 - press * 30, cy + 40 - press * 36);
      this.hand.rotation = -0.35;
      this.hand.scale.set(1 - press * 0.06);
      this.hand.alpha = 0.95;
      if (!this.reduceMotion && press > 0.92) {
        // 누르는 순간 작은 물결
        this.ringG.circle(cx, cy, 18 + (press - 0.92) * 300).stroke({ width: 3, color: COLORS.ring, alpha: 0.5 });
      }
      busy = true;
    } else {
      this.hand.visible = false;
    }

    // 별
    for (let i = this.stars.length - 1; i >= 0; i--) {
      const s = this.stars[i];
      s.life += dt;
      const k = s.life / s.max;
      s.g.x += s.vx * dt;
      s.g.y += s.vy * dt;
      s.vy += 12 * dt; // 아주 약한 중력 → 둥실
      s.g.rotation += s.spin * dt;
      s.g.alpha = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
      s.g.scale.set(0.7 + Math.min(k, 0.3));
      if (k >= 1) {
        s.g.destroy();
        this.stars.splice(i, 1);
      }
    }
    busy ||= this.stars.length > 0;

    // 그리기는 Application이 이 틱 끝에 함. 그릴 것이 없으면 멈춤 (태블릿 배터리)
    if (!busy) app.ticker.stop();
  };
}

/** box-shadow 중 블러·가로 이동 없이 아래로만 내린 단단한 그림자(입체 버튼 바닥)의 두께. 없으면 0 */
function solidDrop(boxShadow: string): number {
  if (!boxShadow || boxShadow === 'none') return 0;
  let drop = 0;
  // 색 함수 안의 쉼표로 나뉘지 않게 괄호 밖 쉼표로만 자름
  for (const part of boxShadow.split(/,(?![^(]*\))/)) {
    if (/\binset\b/.test(part)) continue;
    const [x = 0, y = 0, blur = 0, spread = 0] = (part.match(/-?\d*\.?\d+px/g) ?? []).map(parseFloat);
    if (x === 0 && blur === 0 && y > 0) drop = Math.max(drop, y + spread);
  }
  return drop;
}

/** 세로로 스크롤되는 가장 가까운 조상 */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

function easeInOut(x: number) {
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
}

export const fx = new FxEngine();
