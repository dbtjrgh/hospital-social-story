// 태블릿↔PC 동기화 디버그 패널 (개발 서버 전용, CLAUDE.md 5장)
// client.ts 가 만든 그림자 DOM 안에 따로 그림 → App.tsx 를 건드리지 않고, 앱 CSS 와도 섞이지 않음.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { eventWithTime, Replayer } from 'rrweb';
import type { DevSyncApi, DevSyncSnapshot, LogEntry } from './client';
import type { DeviceRow, EntryKind, ServerInfo } from './protocol';

/** 이 폭 이상이면 처음부터 펼쳐서 오른쪽에 붙임 (CLAUDE.md 5장 1200px, devsync.css 의 max-width: 1199px 와 짝).
 *  1200 - 패널 380 = 820 → 앱 틀(최대 820px)이 그대로 들어감 */
const WIDE_MIN = 1200;
/** 패널 360px + 여백 → 앱이 이만큼 왼쪽으로 비켜남 (base.css: body padding-right) */
const DOCK = '380px';
const OPEN_KEY = 'devsync:open';

const KIND_LABEL: Record<EntryKind, string> = {
  error: '오류',
  warn: '경고',
  event: '이벤트',
  command: '명령',
  system: '연결',
};

/** 기기마다 같은 색 (터치 동그라미·목록 점·기록 이름표) */
export function deviceColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 75% 58%)`;
}

export function mountDebugPanel(container: HTMLElement, api: DevSyncApi): void {
  createRoot(container).render(<DebugPanel api={api} />);
}

function readOpen(): boolean {
  try {
    const saved = window.sessionStorage.getItem(OPEN_KEY);
    if (saved === '1') return true;
    if (saved === '0') return false;
  } catch {
    // 저장소가 막히면 접은 채로
  }
  // 늘 접은 채로 시작 (본인 결정 2026-10-08: 꼭 필요한 기능이 아니라 나중에 뺄 수 있음). 이번 창에서 펼치면 새로고침해도 펼친 채로
  return false;
}

const colorVar = (id: string) => ({ '--ds-c': deviceColor(id) }) as CSSProperties;

function hhmmss(t: number): string {
  return new Date(t).toTimeString().slice(0, 8);
}

function DebugPanel({ api }: { api: DevSyncApi }) {
  const snap = useSyncExternalStore(api.subscribe, api.getSnapshot);
  const [open, setOpen] = useState(readOpen);
  const [wide, setWide] = useState(() => window.innerWidth >= WIDE_MIN);
  /** 화면을 그대로 보고 있는 기기 id */
  const [watching, setWatching] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= WIDE_MIN);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 넓은 화면에서 펼쳤을 때만 붙임. 접거나 좁으면 0 → 앱 배치가 원래대로
  useEffect(() => {
    document.documentElement.style.setProperty('--side-dock', open && wide ? DOCK : '0px');
  }, [open, wide]);

  // "몇 초 전" 을 갱신하려고 펼친 동안만 1초마다 다시 그림
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  const toggle = (next: boolean) => {
    setOpen(next);
    try {
      window.sessionStorage.setItem(OPEN_KEY, next ? '1' : '0');
    } catch {
      // 기억 못 해도 동작
    }
  };

  const count = snap.devices.length;
  // 패널을 접어도 화면 보기는 계속 (오른쪽에 붙어 있을 때만 그 자리를 비워 둠)
  const mirror = watching && (
    <MirrorView
      key={watching}
      api={api}
      snap={snap}
      target={watching}
      right={open && wide ? DOCK : '0px'}
      onClose={() => setWatching(null)}
    />
  );

  if (!open) {
    return (
      <>
        {mirror}
        <button
          type="button"
          className="ds-pill"
          onClick={() => toggle(true)}
          aria-label={`개발 동기화 패널 열기, 연결된 기기 ${count}대`}
        >
          <span className={`ds-dot ${snap.connected ? 'ds-dot--on' : 'ds-dot--off'}`} />
          DEV <b>{count}</b>
        </button>
      </>
    );
  }

  return (
    <>
      {mirror}
      <aside className={`ds-drawer${wide ? ' ds-drawer--docked' : ''}`} aria-label="개발 동기화 패널">
        <header className="ds-head">
          <span className={`ds-dot ${snap.connected ? 'ds-dot--on' : 'ds-dot--off'}`} />
          <strong className="ds-title">DEV 동기화</strong>
          <span className="ds-muted">{snap.connected ? '서버 연결됨' : '연결 끊김 · 다시 찾는 중'}</span>
          <button type="button" className="ds-btn ds-btn--ghost ds-close" onClick={() => toggle(false)} aria-label="패널 접기">
            접기 ›
          </button>
        </header>
  
        <div className="ds-body">
          <SelfSection snap={snap} api={api} />
          <DeviceSection
          snap={snap}
          api={api}
          watching={watching}
          onWatch={(target) => {
            setWatching(target);
            // 좁은 화면에서는 패널이 복사 화면을 덮으므로 접음 (DEV 탭으로 다시 열 수 있음)
            if (target && !wide) toggle(false);
          }}
        />
          <QrSection info={snap.info} />
          <BriefSection />
          <section className="ds-section">
            <h2 className="ds-h">원격 명령</h2>
            <div className="ds-cmds">
              <button type="button" className="ds-btn" onClick={() => api.sendCommand('reload')}>
                모든 기기 새로고침
              </button>
              <button type="button" className="ds-btn" onClick={() => api.sendCommand('home')}>
                모든 기기 처음으로
              </button>
              <button
                type="button"
                className="ds-btn ds-btn--danger"
                onClick={() => {
                  if (window.confirm('모든 기기의 진행(체크·스티커)을 지울까요? 설정은 그대로 둬요.')) api.sendCommand('reset');
                }}
              >
                진행 초기화
              </button>
            </div>
          </section>
          <Timeline snap={snap} api={api} />
        </div>
      </aside>
    </>
  );
}

/**
 * 제작 방향서 바로 보기 (본인 요청 2026-10-07): 제작 방향 PDF.
 * (시안 m1~m5 이미지는 2026-10-09에 지움)
 * 개발 서버가 _mockups 폴더를 그대로 내려줌. 이 패널은 개발 때만 있어서 납품 빌드에는 PDF가 들어가지 않음.
 */
function BriefSection() {
  const base = `${import.meta.env.BASE_URL}_mockups/`;
  return (
    <section className="ds-section">
      <h2 className="ds-h">제작 방향서</h2>
      <a className="ds-btn ds-brief" href={`${base}brief.pdf`} target="_blank" rel="noreferrer">
        제작 방향 PDF 열기
      </a>
      <p className="ds-note">제작 방향 문서 (고객 자료라 공개본에는 없음)</p>
      {/* 발표 슬라이드 (본인 요청 2026-10-07): 태블릿 하나를 TV에 연결해 발표 → 시연. presentation/ 도 개발 서버만 내려줌 */}
      <a className="ds-btn ds-brief" href={`${import.meta.env.BASE_URL}presentation/`} target="_blank" rel="noreferrer">
        발표 슬라이드 열기
      </a>
      <p className="ds-note">진행 보고 7장. 누르거나 밀어서 넘기기, 마지막 장 "다음: 시연"을 누르면 앱이 열림</p>
    </section>
  );
}

function SelfSection({ snap, api }: { snap: DevSyncSnapshot; api: DevSyncApi }) {
  const { self } = snap;
  return (
    <section className="ds-section">
      <h2 className="ds-h">이 기기</h2>
      <div className="ds-self">
        <span className="ds-dot" style={{ background: deviceColor(self.id) }} />
        <strong>{self.name}</strong>
        <span className="ds-muted">{self.id.slice(0, 4)}</span>
        <label className="ds-switch">
          <input type="checkbox" checked={self.follow} onChange={(e) => api.setFollow(e.target.checked)} />
          <span className="ds-switch-track" aria-hidden="true" />
          따라가기
        </label>
      </div>
      <p className="ds-hint">켜 두면 다른 기기의 페이지 이동과 진행 상태(체크·스티커·설정)를 따라가요.</p>
    </section>
  );
}

function ageSeconds(d: DeviceRow, devicesAt: number): number {
  return Math.max(0, Math.round((d.ageMs + (Date.now() - devicesAt)) / 1000));
}

function DeviceSection({
  snap,
  api,
  watching,
  onWatch,
}: {
  snap: DevSyncSnapshot;
  api: DevSyncApi;
  watching: string | null;
  onWatch: (id: string | null) => void;
}) {
  const here = window.location.hash || '#/';
  return (
    <section className="ds-section">
      <h2 className="ds-h">연결된 기기 ({snap.devices.length})</h2>
      {snap.devices.length === 0 ? (
        <p className="ds-muted">아직 없어요. 아래 QR로 태블릿을 연결하세요.</p>
      ) : (
        <ul className="ds-devices">
          {snap.devices.map((d) => {
            const age = ageSeconds(d, snap.devicesAt);
            const mine = d.id === snap.self.id;
            return (
              <li key={d.id} className="ds-device">
                <span className="ds-dot" style={{ background: deviceColor(d.id) }} />
                <div className="ds-device-main">
                  <div>
                    <strong>{d.name}</strong> <span className="ds-muted">{d.id.slice(0, 4)}</span>
                    {mine && <span className="ds-badge">이 기기</span>}
                  </div>
                  <div className="ds-muted">
                    {d.vw}×{d.vh} · <code className="ds-code">{d.route}</code> · 따라가기 {d.follow ? '켬' : '끔'}
                  </div>
                </div>
                <div className="ds-device-side">
                  {/* 하트비트는 5초마다 → 7초 넘으면 신호가 늦은 것 */}
                  <span className={age > 7 ? 'ds-age ds-age--late' : 'ds-age'}>{age}초 전</span>
                  {!mine && (
                    <button
                      type="button"
                      className={watching === d.id ? 'ds-btn ds-btn--small ds-btn--on' : 'ds-btn ds-btn--small'}
                      onClick={() => onWatch(watching === d.id ? null : d.id)}
                      aria-pressed={watching === d.id}
                    >
                      {watching === d.id ? '보는 중' : '화면 보기'}
                    </button>
                  )}
                  {!mine && d.route !== here && (
                    <button type="button" className="ds-btn ds-btn--small" onClick={() => api.goTo(d.route)}>
                      이 화면으로
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** rrweb 이벤트 종류 번호 (rrweb 를 미리 불러오지 않으려고 숫자로 씀) */
const EVENT_FULL_SNAPSHOT = 2;
const EVENT_INCREMENTAL = 3;
const EVENT_META = 4;
const SOURCE_MOUSE_INTERACTION = 2;
/** 남길 마우스 상호작용: Click·TouchStart·TouchEnd·TouchCancel (터치 동그라미 표시용).
 *  나머지(누름·뗌·포커스 등)는 rrweb 가 복사 화면 안에서 이벤트를 다시 일으켜 "Blocked script execution" 경고를 냄 → 버림 */
const KEEP_INTERACTIONS = new Set([2, 7, 9, 10]);

function keepEvent(e: eventWithTime): boolean {
  if (e.type !== EVENT_INCREMENTAL) return true;
  const data = e.data as { source?: number; type?: number };
  return data.source !== SOURCE_MOUSE_INTERACTION || KEEP_INTERACTIONS.has(data.type ?? -1);
}

/**
 * 그 기기의 빛 고리·손가락·스포트라이트는 Pixi 캔버스라 녹화되지 않음 →
 * fx.ts 가 목표 요소에 남기는 data-fx-guide("ring" | "hand")·data-fx-spot 표시를 비슷한 모양으로 그림
 */
const FX_MIRROR_CSS = [
  '[data-fx-guide] { outline: 4px solid #ffb703 !important; outline-offset: 0px !important; }',
  "[data-fx-guide='hand'] { animation: ds-fx-tap 0.8s ease-in-out 6 alternate !important; }",
  '@keyframes ds-fx-tap { to { outline-width: 7px; } }',
  '[data-fx-spot] { outline: 100vmax solid rgba(245, 250, 255, 0.55) !important; outline-offset: 10px !important; }',
];

/**
 * 화면 그대로 보기: 다른 기기 화면을 앱 자리에 실시간으로 (rrweb Replayer, 여기서 누르는 것은 안 됨).
 * 스크롤·보호자 안내·연습 도중 상태까지 보임. 빛 고리·손가락은 노란 테두리로 대신 (별 반짝임은 빠짐).
 */
function MirrorView({
  api,
  snap,
  target,
  right,
  onClose,
}: {
  api: DevSyncApi;
  snap: DevSyncSnapshot;
  target: string;
  right: string;
  onClose: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const device = snap.devices.find((d) => d.id === target);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let disposed = false;
    let Player: typeof Replayer | null = null;
    let replayer: Replayer | null = null;
    let backlog: { events: eventWithTime[]; checkout: boolean }[] = [];
    let lastTs = 0;
    let size = { width: 0, height: 0 };

    // 기기 화면 크기 그대로 그린 것을 이 자리에 맞게 줄여서 가운데에
    const fit = () => {
      const wrapper = stage.querySelector<HTMLElement>('.replayer-wrapper');
      if (!wrapper || !size.width || !size.height) return;
      const scale = Math.min(stage.clientWidth / size.width, stage.clientHeight / size.height);
      wrapper.style.transform = `scale(${scale})`;
      wrapper.style.left = `${Math.max(0, (stage.clientWidth - size.width * scale) / 2)}px`;
      wrapper.style.top = `${Math.max(0, (stage.clientHeight - size.height * scale) / 2)}px`;
    };

    // 화면 전체가 올 때마다 새 틀에 그림 (기기 새로고침·다른 기기가 보기 시작).
    // 같은 틀에 다시 그리면 rrweb 가 스크립트 막힌 iframe 에 document.open() 을 해서 경고가 뜸
    const restart = (Ctor: typeof Replayer) => {
      replayer?.destroy();
      // pauseAnimation: false — rrweb 기본값은 CSS 애니메이션을 멈춰 둠(rrweb-paused) → 서서히 나타나는(.reveal) 제목·카드·사진이 투명한 첫 장면에서 멈춰 안 보였음
      replayer = new Ctor([], {
        root: stage,
        liveMode: true,
        mouseTail: false,
        showWarning: false,
        pauseAnimation: false,
        insertStyleRules: FX_MIRROR_CSS,
      });
      replayer.on('resize', (d) => {
        size = d as { width: number; height: number };
        fit();
      });
      replayer.startLive();
      lastTs = 0;
    };

    const feed = (events: eventWithTime[], checkout: boolean) => {
      if (!Player) return;
      let list = events.filter(keepEvent);
      // 다른 기기가 보기 시작해서 다시 찍은 화면 전체: 이미 보고 있으면 그 화면 전체만 건너뜀 (다시 그리면 깜빡이고 등장 애니메이션이 또 돎).
      // 찍는 쪽 노드 번호는 그대로라 이어지는 조각은 그대로 맞음
      if (checkout && replayer) list = list.filter((e) => e.type !== EVENT_FULL_SNAPSHOT && e.type !== EVENT_META);
      // 이 묶음의 마지막 화면 전체(FullSnapshot)부터 새로. 바로 앞의 Meta(화면 크기)도 같이
      let full = -1;
      list.forEach((e, i) => {
        if (e.type === EVENT_FULL_SNAPSHOT) full = i;
      });
      if (full >= 0) {
        list = list.slice(full > 0 && list[full - 1].type === EVENT_META ? full - 1 : full);
        restart(Player);
        setLive(true);
      }
      // 화면 전체가 오기 전 조각은 버림
      if (!replayer || list.length === 0) return;
      // 기기마다 시계가 달라서 받은 시각 기준으로 다시 매김 (간격·순서는 그대로)
      const now = Date.now();
      const first = list[0].timestamp;
      for (const e of list) {
        lastTs = Math.max(now + (e.timestamp - first), lastTs + 1);
        replayer.addEvent({ ...e, timestamp: lastTs });
      }
    };

    const stop = api.watchScreen(target, (events, checkout) => {
      if (Player) feed(events, checkout);
      else backlog.push({ events, checkout });
    });

    import('rrweb')
      .then((rrweb) => {
        if (disposed) return;
        Player = rrweb.Replayer;
        backlog.forEach((b) => feed(b.events, b.checkout));
        backlog = [];
      })
      .catch((err: unknown) => console.warn('[devsync] 화면 보기 도구를 불러오지 못함', err));

    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => {
      disposed = true;
      stop();
      observer.disconnect();
      replayer?.destroy();
    };
  }, [api, target]);

  return (
    <div className="ds-mirror" style={{ right }} role="region" aria-label="다른 기기 화면">
      <div className="ds-mirror-head">
        <span className="ds-dot" style={{ background: deviceColor(target) }} />
        <strong>{device?.name ?? '기기'}</strong>
        <span className="ds-muted">
          {target.slice(0, 4)} · 실시간 화면{device ? ` · ${device.vw}×${device.vh}` : ''}
        </span>
        <button type="button" className="ds-btn ds-btn--ghost ds-mirror-close" onClick={onClose}>
          닫기 ✕
        </button>
      </div>
      <div className="ds-mirror-stage">
        {/* rrweb 가 이 안에 화면(iframe)을 직접 넣음 → React 자식은 두지 않음 */}
        <div ref={stageRef} className="ds-mirror-screen" />
        {!device ? (
          <p className="ds-mirror-wait">이 기기가 나갔어요. 다시 들어오면 이어서 보여요.</p>
        ) : (
          !live && <p className="ds-mirror-wait">화면을 받는 중…</p>
        )}
      </div>
      <p className="ds-mirror-foot ds-muted">보기만 돼요. 빛 고리·손가락 안내는 노란 테두리로 보여요 (별 반짝임은 안 보여요).</p>
    </div>
  );
}

function QrSection({ info }: { info: ServerInfo | null }) {
  const [picked, setPicked] = useState(0);
  let body: ReactNode;
  if (!info) body = <p className="ds-muted">서버 정보를 기다리는 중…</p>;
  else if (info.qr.length === 0) {
    body = <p className="ds-warn">LAN 주소를 찾지 못했어요. PC가 와이파이에 연결됐는지 확인하세요.</p>;
  } else {
    const index = Math.min(picked, info.qr.length - 1);
    const current = info.qr[index];
    body = (
      <div className="ds-qr">
        {/* SVG 는 우리 개발 서버가 qrcode 패키지로 만든 것 */}
        <div className="ds-qr-img" dangerouslySetInnerHTML={{ __html: current.svg }} />
        <div className="ds-qr-urls">
          <p className="ds-hint">
            같은 와이파이의 태블릿 카메라로 찍으세요.
          </p>
          {info.qr.map((q, i) => (
            <button
              key={q.url}
              type="button"
              className={i === index ? 'ds-url ds-url--on' : 'ds-url'}
              onClick={() => setPicked(i)}
            >
              {q.url}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <section className="ds-section">
      <h2 className="ds-h">태블릿 연결</h2>
      {body}
    </section>
  );
}

type Filter = 'all' | 'logs' | 'events';

function Timeline({ snap, api }: { snap: DevSyncSnapshot; api: DevSyncApi }) {
  const [filter, setFilter] = useState<Filter>('all');
  const listRef = useRef<HTMLDivElement>(null);
  /** 맨 아래를 보고 있을 때만 새 기록에 맞춰 내려감 (위로 올려 읽는 중이면 그대로) */
  const stick = useRef(true);

  const items: LogEntry[] =
    filter === 'logs'
      ? snap.logs
      : filter === 'events'
        ? snap.events
        : [...snap.logs, ...snap.events].sort((a, b) => a.key - b.key);
  const lastKey = items.length > 0 ? items[items.length - 1].key : 0;

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lastKey, filter]);

  const tabs: [Filter, string, number][] = [
    ['all', '전체', snap.logs.length + snap.events.length],
    ['logs', '로그', snap.logs.length],
    ['events', '이벤트', snap.events.length],
  ];

  return (
    <section className="ds-section ds-section--grow">
      <div className="ds-tabs" role="tablist" aria-label="기록 종류">
        {tabs.map(([key, label, n]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            className={filter === key ? 'ds-tab ds-tab--on' : 'ds-tab'}
            onClick={() => {
              stick.current = true;
              setFilter(key);
            }}
          >
            {label} {n}
          </button>
        ))}
        <button type="button" className="ds-btn ds-btn--ghost ds-btn--small ds-clear" onClick={api.clearEntries}>
          지우기
        </button>
      </div>
      <div
        ref={listRef}
        className="ds-log"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {items.length === 0 ? (
          <p className="ds-muted ds-empty">기록이 없어요.</p>
        ) : (
          items.map((e) => (
            <div key={e.key} className={`ds-entry ds-entry--${e.kind}`}>
              <div className="ds-entry-meta">
                <span className="ds-time">{hhmmss(e.t)}</span>
                <span className="ds-chip" style={colorVar(e.from)}>
                  {e.name}
                  {e.self ? ' (나)' : ''}
                </span>
                <span className="ds-kind">{KIND_LABEL[e.kind]}</span>
                {e.route && <code className="ds-code">{e.route}</code>}
              </div>
              <pre className="ds-msg">{e.message}</pre>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
