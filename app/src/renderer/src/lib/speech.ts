// 읽어 주기 (2026-10-06 본인 결정: 병원 음원이 올 때까지 임시로 기기 음성)
//   ① 병원 음원 파일이 있으면 그 파일
//   ② 없으면 기기 음성(TTS) — 태블릿·브라우저에 들어 있는 한국어 목소리 중 자연스러운 여성 목소리, 조금 천천히
//   ③ 기기 음성을 못 쓰면(한국어 목소리 없음, 자동 점검) 글자 수만큼 "읽는 척"
// 어느 쪽이든 읽는 동안: 들어보기 버튼이 움직이고(useIsSpeaking), 읽은 글자가 차례로 색이 바뀌고(useReadIndex), 시선 유도는 멈춤.
// cue: 다 읽으면 바로 빛 고리 (페이지 문장·들어보기만. 연습 중 숫자 세기 같은 짧은 말은 아님)
import { useSyncExternalStore } from 'react';
import { asset, hasMedia } from './asset';
import { getState } from './store';

/** 음성을 못 쓸 때 읽는 척하는 시간: 한 글자 약 0.14초 (천천히 읽는 속도), 1.2~9초 */
function fakeReadMs(text: string): number {
  const chars = text.replace(/\s+/g, '').length;
  return Math.min(9000, Math.max(1200, 400 + chars * 140));
}

// ── 기기 음성 ──

/** 자동 점검(webdriver)에서는 소리 없이·시간 일정하게 읽는 척. sessionStorage tts=1 이면 점검에서도 기기 음성 (확인용) */
function ttsAllowed(): boolean {
  if (!('speechSynthesis' in window)) return false;
  let force = false;
  try {
    force = sessionStorage.getItem('tts') === '1';
  } catch {
    // 저장소가 막혀도 그대로
  }
  return force || !navigator.webdriver;
}

/**
 * 한국어 목소리 중 자연스러운 여성 목소리를 먼저 (기기마다 이름이 다름:
 * 아이패드 "유나", Edge "SunHi Online (Natural)", 크롬 "Google 한국의", 윈도우 "Heami" 등).
 * undefined = 아직 목록을 못 받음 → 언어만 정해서 기기에 맡김 / null = 한국어 목소리가 없음 → 읽는 척
 */
function pickVoice(): SpeechSynthesisVoice | null | undefined {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return undefined;
  const korean = voices.filter((v) => /^ko/i.test(v.lang));
  if (!korean.length) return null;
  const score = (v: SpeechSynthesisVoice) => {
    let s = 0;
    if (/natural|neural|enhanced|premium|고품질/i.test(v.name)) s += 5;
    if (/google/i.test(v.name)) s += 3;
    if (/yuna|유나|sunhi|선희|jimin|지민|seoyeon|heami|해미/i.test(v.name)) s += 2;
    if (/injoon|인준|hyunsu|현수|bongjin|gookmin|male/i.test(v.name)) s -= 10; // 남자 목소리는 뒤로
    return s;
  };
  return [...korean].sort((a, b) => score(b) - score(a))[0];
}

let loggedVoice = '';

if (ttsAllowed()) {
  speechSynthesis.getVoices(); // 목록 미리 받기 (크롬은 처음 부를 때 비어 있음)
  // 아이패드 사파리: 첫 터치 안에서 한 번 말해야 그 뒤로 기기 음성이 나옴 → 첫 터치 때 소리 없는 말 한 번
  document.addEventListener(
    'pointerdown',
    () => {
      const unlock = new SpeechSynthesisUtterance(' ');
      unlock.volume = 0;
      speechSynthesis.speak(unlock);
    },
    { once: true, capture: true },
  );
}

// ── 지금 읽는 것 (버튼·글자 애니메이션이 구독) ──

/** 지금 읽는 문장과, 어디까지 읽었는지(글자 수) */
type Reading = { text: string; index: number } | null;
let reading: Reading = null;
const readingListeners = new Set<() => void>();

function setReading(next: Reading) {
  if (next === reading || (next && reading && next.text === reading.text && next.index === reading.index)) return;
  reading = next;
  readingListeners.forEach((l) => l());
}

function subscribeReading(listener: () => void) {
  readingListeners.add(listener);
  return () => readingListeners.delete(listener);
}

export function getReading(): Reading {
  return reading;
}

/** 이 문장을 지금 읽고 있는지 (들어보기 버튼이 움직임) */
export function useIsSpeaking(text: string): boolean {
  return useSyncExternalStore(subscribeReading, () => reading?.text === text);
}

/** 이 문장을 읽는 중이면 몇 글자째까지 읽었는지, 아니면 null (읽은 글자가 차례로 색이 바뀜) */
export function useReadIndex(text: string): number | null {
  return useSyncExternalStore(subscribeReading, () => (reading?.text === text ? reading.index : null));
}

// 읽어 주는 중인지 알림 → 그동안 시선 유도(빛 고리·손가락)를 멈춤 (fx/FxLayer 가 구독)
let speaking = false;
const speakingListeners = new Set<(on: boolean) => void>();

function setSpeaking(on: boolean) {
  if (speaking === on) return;
  speaking = on;
  speakingListeners.forEach((l) => l(on));
}

export function onSpeakingChange(listener: (on: boolean) => void): () => void {
  speakingListeners.add(listener);
  return () => speakingListeners.delete(listener);
}

// cue 로 읽은 것이 끝까지 끝났을 때만 알림 (멈춤·페이지 이동·재생 실패는 아님) → 바로 빛 고리 (fx/FxLayer 가 구독)
const finishedListeners = new Set<() => void>();

export function onSpeechFinished(listener: () => void): () => void {
  finishedListeners.add(listener);
  return () => finishedListeners.delete(listener);
}

/**
 * 기기 음성에 넘길 문장: "엄마/아빠"의 빗금을 "또는"으로 (기호로 "슬래시"라고 읽지 않게. 2026-10-04 에 고쳤다가 기기 음성을 다시 넣으며 빠졌던 것).
 * shownAt[i] = 넘긴 문장 i번째 글자가 화면 문장의 몇 번째 글자인지 → 색이 바뀌는 자리를 화면 문장에 맞춤
 */
export function forVoice(text: string): { said: string; shownAt: number[] } {
  let said = '';
  const shownAt: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const part = text[i] === '/' ? ' 또는 ' : text[i];
    said += part;
    for (let k = 0; k < part.length; k++) shownAt.push(i);
  }
  shownAt.push(text.length);
  return { said, shownAt };
}

// ── 읽기 ──

let currentAudio: HTMLAudioElement | null = null;
/** 사파리는 말하는 중인 객체를 잡고 있지 않으면 끝 알림이 사라질 수 있음 → 여기 잡아 둠 */
let currentUtterance: SpeechSynthesisUtterance | null = null;
let timers: number[] = [];
/** 읽기마다 번호. 멈춘 읽기의 늦은 끝 알림이 새 읽기를 끝난 것으로 만들지 않게 */
let generation = 0;
/** 지금 읽기의 끝 알림. 멈추면 그 자리에서 한 번 부름 (다른 들어보기 버튼이 "멈춤"에 남지 않게) */
let pendingEnd: ((finished: boolean) => void) | undefined;

function clearTimers() {
  timers.forEach((id) => window.clearTimeout(id));
  timers = [];
}

export function stopSpeaking(): void {
  generation++;
  clearTimers();
  if (currentAudio) {
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio.ontimeupdate = null;
    currentAudio.pause();
    currentAudio = null;
  }
  if (currentUtterance) {
    currentUtterance = null;
    speechSynthesis.cancel();
  }
  setReading(null);
  setSpeaking(false);
  const end = pendingEnd;
  pendingEnd = undefined;
  end?.(false);
}

/** onEnd(finished): 끝까지 읽었으면 true, 멈춤·페이지 이동·재생 실패·소리 끔이면 false */
export function speak(text: string, options: { audio?: string; onEnd?: (finished: boolean) => void; cue?: boolean } = {}): void {
  const { sound, volume, rate } = getState().settings;
  const { audio, onEnd, cue = false } = options;
  stopSpeaking();
  if (!sound) {
    onEnd?.(false);
    return;
  }
  setSpeaking(true);
  const mine = generation;
  const length = text.length;
  pendingEnd = onEnd;
  setReading({ text, index: 0 });

  const end = (finished: boolean) => {
    if (mine !== generation) return;
    clearTimers();
    pendingEnd = undefined;
    currentAudio = null;
    currentUtterance = null;
    setReading(null);
    setSpeaking(false);
    onEnd?.(finished);
    if (finished && cue) finishedListeners.forEach((l) => l());
  };

  /** 어림 진행: ms 동안 글자가 고르게 읽힌다고 보고 0.1초마다 앞으로 (더 앞선 실제 값이 있으면 그것) */
  let actual = 0;
  const estimate = (ms: number) => {
    const start = performance.now();
    const tick = () => {
      if (mine !== generation) return;
      const guess = Math.floor(((performance.now() - start) / ms) * length);
      setReading({ text, index: Math.min(length, Math.max(guess, actual)) });
      timers.push(window.setTimeout(tick, 100));
    };
    tick();
  };

  // ① 병원 음원 파일
  if (hasMedia(audio)) {
    const a = new Audio(asset(audio));
    a.volume = volume;
    a.onended = () => end(true);
    a.onerror = () => end(false);
    a.ontimeupdate = () => {
      if (a.duration > 0) setReading({ text, index: Math.min(length, Math.round((a.currentTime / a.duration) * length)) });
    };
    currentAudio = a;
    a.play().catch(() => {
      console.warn(`[사운드] 재생 실패: ${audio}`);
      end(false);
    });
    return;
  }

  // ② 기기 음성
  const voice = ttsAllowed() ? pickVoice() : null;
  if (voice !== null) {
    const { said, shownAt } = forVoice(text);
    const u = new SpeechSynthesisUtterance(said);
    u.lang = 'ko-KR';
    if (voice) u.voice = voice;
    u.rate = rate;
    u.volume = volume;
    // 단어마다 "여기 읽는 중" 알림 (주는 기기만) → 어림보다 앞서면 그 자리까지
    u.onboundary = (e) => {
      const next = said.indexOf(' ', e.charIndex);
      actual = Math.max(actual, next < 0 ? length : shownAt[next]);
    };
    u.onend = () => end(true);
    // 'not-allowed' = 아직 아무것도 안 눌러서 브라우저가 막음 (주소로 바로 연 첫 화면) → 소리 없이 끝, 빛 고리도 안 띄움
    u.onerror = () => end(false);
    currentUtterance = u;
    const ms = fakeReadMs(text) / Math.max(rate, 0.5);
    estimate(ms * 1.1);
    // 끝 알림을 가끔 안 주는 브라우저가 있어 넉넉히 기다린 뒤 끝낸 것으로 봄
    timers.push(window.setTimeout(() => end(true), ms * 2 + 2000));
    if (voice && loggedVoice !== voice.name) {
      loggedVoice = voice.name;
      console.info(`[임시 음성] 기기 목소리: ${voice.name}`);
    }
    speechSynthesis.speak(u);
    return;
  }

  // ③ 읽는 척
  const ms = fakeReadMs(text);
  console.warn(
    `[사운드 없음] 음성 파일 없음: ${audio ?? '(원고에 음성 파일 자리 없음)'} — "${text}" (소리 없이 ${(ms / 1000).toFixed(1)}초 동안 읽기 표시만)`,
  );
  estimate(ms);
  timers.push(window.setTimeout(() => end(true), ms));
}

/** 화면 문장 → 읽기용 문장 (줄바꿈을 쉼으로) */
export function toSpeech(...parts: (string | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join(' ')
    .replace(/\n/g, ' ');
}
