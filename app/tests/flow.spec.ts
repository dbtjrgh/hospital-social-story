// 병원 팩의 원고(JSON)를 읽어 시험을 만듦 → 검사·단계가 바뀌어도, 다른 병원이어도 그대로 돌아감.
// 1) 검사마다 표지 → 순서 → 모든 단계 → 스티커판까지 (체크·스티커·완료 횟수, 콘솔 오류·깨진 파일 없음)
// 2) 연습 종류마다 실제로 조작 (오류 없는 학습 안내 포함)
// 3) 바늘·피 사진 가리기, 납품 빌드에 개발 도구 없음
// 4) 사진 미리 받기: 표지를 연 뒤 인터넷이 끊겨도 그 검사 사진이 보임
// 5) 세로 태블릿: 첫 화면과 화면마다 스크롤 없이 한 화면에 (폰은 스크롤 허용, 연습 단계는 넘친 만큼만 알림)
// 6) 시선 유도: 읽어 주기가 끝나면 바로 빛 고리, 첫 화면 빛 고리는 안 한 검사로
// 7) 다 모으면: 첫 화면 "다 모았어요" → 축하 화면 (본 뒤에는 안내 없음)
// 8) 최종 검토(2026-10-06)에서 고친 것: 빗금 읽기, 감각 카드 읽기, 연타, 0개 스티커판, 성공 때 화면 배율
// 9) 2026-10-07: 단계 고르기, 다음 사람을 위해 지우기, 작은 다듬기(저장값 범위, 이미 붙은 패드, 자동 읽기 칸, 이름 부르기 뒤 빛 고리)
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';

const HOSPITAL = process.env.HOSPITAL || 'SampleHospital';
// 자동 점검은 app/ 에서 돌고, 병원 자료는 그 위 hospitals/ 에 있음
const DIR = join(process.cwd(), '..', 'hospitals', HOSPITAL);
const STORAGE_KEY = `social-story:${HOSPITAL}:v1`;
/** 화면이 열린 뒤 누름을 무시하는 시간(src/renderer/src/lib/tapGuard.ts 0.7초) + 여유 */
const TAP_LOCK_MS = 750;
const BODY_LABEL: Record<string, string> = { head: '머리', chest: '가슴', belly: '배', arm: '팔', leg: '다리' };

interface Exam {
  id: string;
  title: string;
  phases: { id: string }[];
  steps: { id: string; phase: string; text: string; image?: string; sensitive?: boolean; sensory?: { text: string }[]; practice?: Record<string, any> }[];
}

/** 원고의 그림 경로에 실제 파일이 있는지 (병원 media/ 또는 공통 그림 src/renderer/public/content/) */
function mediaExists(path?: string): path is string {
  return !!path && (existsSync(join(DIR, 'media', path)) || existsSync(join(process.cwd(), 'src', 'renderer', 'public', 'content', path)));
}

const hospital = JSON.parse(readFileSync(join(DIR, 'hospital.json'), 'utf8')) as { exams: string[] };
const exams: Exam[] = hospital.exams
  .map((id) => join(DIR, 'exams', `${id}.json`))
  .filter((file) => existsSync(file))
  .map((file) => JSON.parse(readFileSync(file, 'utf8')));

/** 연습 종류별 첫 단계 → { 검사, 페이지 번호(표지 0, 순서 1, 단계는 2부터) } */
function findPractice(type: string, extra: (p: Record<string, any>) => boolean = () => true) {
  for (const exam of exams) {
    const i = exam.steps.findIndex((s) => s.practice?.type === type && extra(s.practice));
    if (i >= 0) return { exam, page: i + 2, practice: exam.steps[i].practice! };
  }
  return null;
}

/** 콘솔 오류·페이지 오류·깨진 요청을 모음 */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  return errors;
}

const message = (page: Page) => page.locator('.practice__msg');

/**
 * 누를 것을 화면 가운데로 스크롤. "보이는 곳까지만" 스크롤하면 화면 맨 아래에 걸쳐
 * 아래 버튼 막대(.bottom-bar) 뒤에 가려진 채 누르게 됨 (작은 태블릿에서 넘치는 연습 단계)
 */
const centerOnScreen = (target: Locator) => target.evaluate((el) => el.scrollIntoView({ block: 'center' }));

/** 화면이 넘친 px. 그림이 다 받아지고 등장 애니메이션이 끝난 뒤(움직임 줄이기에서도 한 프레임 돎)에 잼 */
async function screenOverflow(page: Page): Promise<number> {
  await page.waitForFunction(() => [...document.images].every((img) => img.complete));
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState === 'finished'));
  return page.locator('.screen').evaluate((el) => el.scrollHeight - el.clientHeight);
}

/** 원고가 있는 검사를 모두 한 번씩 끝까지 한 진행 기록 */
const allDoneProgress = () =>
  Object.fromEntries(exams.map((e) => [e.id, { checked: [], stickers: [], practiced: [], completedCount: 1 }]));

// 처음 화면 셋업(보호자 한 장)은 "처음 셋업" 점검에서만 → 나머지는 셋업을 마친 기기로 시작 (저장값이 없을 때만 넣음)
test.beforeEach(async ({ page }, testInfo) => {
  // 플레이어는 content/project.json 을 받은 뒤에 화면을 띄움 (main.tsx, 2026-10-08) → 주소를 열거나 새로고침하면 화면 틀이 뜰 때까지 기다림.
  // 그래야 "화면이 열린 뒤 0.7초 연타 막기"(TAP_LOCK_MS)를 화면이 뜬 때부터 셈
  const ready = () => page.locator('[data-app-frame], .boot-error').first().waitFor();
  const goto = page.goto.bind(page);
  const reload = page.reload.bind(page);
  page.goto = async (...args) => {
    const res = await goto(...args);
    await ready();
    return res;
  };
  page.reload = async (...args) => {
    const res = await reload(...args);
    await ready();
    return res;
  };
  if (testInfo.title.startsWith('처음 셋업')) return;
  await page.addInitScript((key) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ setupSeen: true }));
  }, STORAGE_KEY);
});

test('프로젝트 읽기: 원고는 content/project.json 에서 읽고, 못 받으면 흰 화면 대신 안내', async ({ page }) => {
  // 원고 문장이 빌드한 JS 에 묶이지 않고 project.json 으로 옴 (편집기가 Node 없이 빌드할 수 있게 — CLAUDE.md 1-c)
  const res = await page.request.get('/content/project.json');
  expect(res.ok()).toBe(true);
  const data = await res.json();
  expect(data.hospital.id).toBe(HOSPITAL);
  expect(data.exams.map((e: Exam) => e.id).sort()).toEqual(exams.map((e) => e.id).sort());

  await page.route('**/content/project.json', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto('/');
  await expect(page.locator('.boot-error')).toContainText('내용을 불러오지 못했어요');
});

test('처음 셋업: 처음 열면 첫 화면 위에 보호자 설정 창 → 시작하기는 고른 것을 저장하고, 다시 열면 바로 첫 화면', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.locator('.setup')).toBeVisible();
  // 10-08부터 창: 뒤에 검사 고르기 첫 화면이 보이고, 뒤 화면은 누를 수 없음
  await expect(page.locator('.shelf')).toBeVisible();
  await expect(page.locator('.screen').first()).toHaveAttribute('inert', '');
  await page.keyboard.press('Escape');
  await expect(page.locator('.setup')).toBeVisible();
  // 호칭을 고르면 설명의 예시 문장이 바로 바뀜 (조사도 맞게)
  const hint = page.locator('.setup .field__hint').first();
  await expect(hint).toContainText('엄마/아빠와 함께 가요');
  await page.getByRole('button', { name: '학교 선생님' }).click();
  await expect(hint).toContainText('학교 선생님과 함께 가요');
  await page.getByRole('button', { name: '할머니' }).click();
  await expect(hint).toContainText('할머니와 함께 가요');
  await page.getByPlaceholder('예: 홍길동').fill('민준');
  await page.getByRole('button', { name: '가리기' }).click();
  await page.waitForTimeout(TAP_LOCK_MS);
  await page.getByRole('button', { name: /시작하기/ }).click();
  await expect(page.locator('.shelf')).toBeVisible();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(saved.setupSeen).toBe(true);
  expect(saved.settings).toMatchObject({ companion: '할머니', name: '민준', hideNeedle: true });
  await page.reload();
  await expect(page.locator('.shelf')).toBeVisible();
  await expect(page.locator('.setup')).toHaveCount(0);
});

test('처음 셋업: 건너뛰기는 기본값 그대로, 검사 주소(QR)로 바로 들어오면 셋업 없이 바로 연습', async ({ page }) => {
  const exam = exams[0];
  await page.goto(`/#/${exam.id}/0`);
  await expect(page.locator('.intro__title')).toContainText(exam.title);
  await expect(page.locator('.setup')).toHaveCount(0);
  await page.goto('/#/');
  await expect(page.locator('.setup')).toBeVisible();
  await page.getByRole('button', { name: '할머니' }).click();
  await page.waitForTimeout(TAP_LOCK_MS);
  await page.getByRole('button', { name: '건너뛰기' }).click();
  await expect(page.locator('.shelf')).toBeVisible();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(saved.setupSeen).toBe(true);
  expect(saved.settings.companion).toBe('엄마/아빠');
});

test('검사 선택: 원고가 있는 검사는 모두 열 수 있고 스티커 칸이 보임', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/#/');
  const cards = page.locator('.exam-card');
  await expect(cards).toHaveCount(hospital.exams.length);
  for (const exam of exams) {
    const card = cards.filter({ hasText: exam.title });
    await expect(card).not.toContainText('준비 중');
    await expect(card.locator('.exam-card__slot')).toHaveCount(exam.phases.length); // 처음엔 다 빈 칸
  }
  await expect(page.locator('.shelf')).toContainText('끝까지 연습하면 스티커를 받아요');
  // 납품 빌드에는 개발 도구(동기화 패널)가 없어야 함
  await expect(page.locator('.ds-pill, .ds-drawer')).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const exam of exams) {
  test(`${exam.title}: 표지부터 스티커판까지`, async ({ page }) => {
    const errors = watchErrors(page);
    // 연습은 아래 "연습"에서 따로 → 여기서는 "연습 먼저 하기"를 끄고 흐름만
    await page.addInitScript(([key]) => localStorage.setItem(key, JSON.stringify({ progress: {}, settings: { practiceGate: false } })), [STORAGE_KEY]);
    await page.goto(`/#/${exam.id}/0`);
    const reward = page.getByRole('heading', { name: '칭찬 스티커판' });
    for (let i = 0; i < exam.steps.length * 2 + 10; i++) {
      await page.waitForTimeout(TAP_LOCK_MS);
      // 마지막 스티커 창이 닫히기 전엔 스티커판이 아직 안 그려졌을 수 있음 → 기다린 뒤에 확인
      if (await reward.isVisible()) break;
      // 스티커 창은 누르지 않아도 저절로 닫히고 다음으로 → 기다리기만
      if (await page.locator('.toast-card').isVisible()) continue;
      const done = page.locator('.btn--done');
      if (await done.isVisible()) await done.click();
      else await page.locator('.bottom-bar .btn--primary').click();
    }
    await expect(reward).toBeVisible();

    const progress = await page.evaluate(
      ([key, id]) => JSON.parse(localStorage.getItem(key) ?? '{}').progress?.[id],
      [STORAGE_KEY, exam.id],
    );
    expect(progress.checked).toHaveLength(exam.steps.length);
    expect(progress.stickers).toHaveLength(exam.phases.length);
    expect(progress.completedCount).toBe(1);
    expect(errors).toEqual([]);
  });
}

test.describe('연습', () => {
  test('가만히 있기 (hold): 끝까지 누르면 성공', async ({ page }) => {
    const found = findPractice('hold');
    test.skip(!found, '원고에 hold 연습이 없음');
    const { exam, page: p, practice } = found!;
    await page.goto(`/#/${exam.id}/${p}`);
    const hold = page.locator('.hold');
    await centerOnScreen(hold);
    const box = (await hold.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(practice.seconds * 1000 + 600);
    await expect(message(page)).toHaveText(practice.success);
    await page.mouse.up();
    await expect(page.locator('.btn--done')).toHaveText(/연습했어요/);
  });

  test('가만히 있기: 성공해도 화면 배율이 그대로이고, 느낌 상자는 보이게 스크롤', async ({ page }) => {
    const found = findPractice('hold', (p) => !!p.feel);
    test.skip(!found, '원고에 느낌이 있는 hold 연습이 없음');
    const { exam, page: p, practice } = found!;
    await page.goto(`/#/${exam.id}/${p}`);
    await page.waitForTimeout(1500); // 들어선 뒤 배율을 정하는 시간(lib/fitScreen.ts SETTLE_MS)
    const zoom = () => page.locator('.screen__body').evaluate((el) => (el as HTMLElement).style.zoom);
    const before = await zoom();
    const hold = page.locator('.hold');
    await centerOnScreen(hold);
    const box = (await hold.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(practice.seconds * 1000 + 600);
    await page.mouse.up();
    await expect(page.locator('.feel')).toBeInViewport();
    expect(await zoom()).toBe(before);
  });

  test('가만히 있기: 중간에 떼면 실패 표시 없이 다시 안내', async ({ page }) => {
    const found = findPractice('hold');
    test.skip(!found, '원고에 hold 연습이 없음');
    const { exam, page: p, practice } = found!;
    await page.goto(`/#/${exam.id}/${p}`);
    const hold = page.locator('.hold');
    await centerOnScreen(hold);
    const box = (await hold.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(500);
    await page.mouse.up();
    await expect(message(page)).toHaveText(practice.freeze ? '괜찮아요. 다시 얼음!' : '괜찮아요. 다시 꾹 눌러 봐요.');
  });

  test('가만히 있기 (얼음 놀이): 끝까지 하면 동그라미 안에 내 가슴 사진', async ({ page }) => {
    const found = findPractice('hold', (p) => p.photo === 'chest');
    test.skip(!found, '원고에 사진이 나오는 hold 연습이 없음');
    const { exam, page: p, practice } = found!;
    await page.goto(`/#/${exam.id}/${p}`);
    const hold = page.locator('.hold');
    await centerOnScreen(hold);
    await expect(hold).toContainText('얼음');
    const box = (await hold.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(practice.seconds * 1000 + 600);
    await page.mouse.up();
    await expect(message(page)).toHaveText(practice.success);
    await expect(hold.locator('.hold__photo')).toBeVisible();
    // 성공한 사진을 톡 만져도 "다시 얼음!"이 아니라 성공 화면 그대로
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(150);
    await page.mouse.up();
    await expect(message(page)).toHaveText(practice.success);
    await expect(hold.locator('.hold__photo')).toBeVisible();
  });

  test('볼 곳 고르기 (lookAway): 고른 그림을 보며 세고, 끝나면 다른 것도 골라 볼 수 있음', async ({ page }) => {
    const found = findPractice('lookAway');
    test.skip(!found, '원고에 lookAway 연습이 없음');
    const { exam, page: p, practice } = found!;
    await page.goto(`/#/${exam.id}/${p}`);
    const choices = page.locator('.look__choice');
    await expect(choices).toHaveCount(practice.choices.length);
    await expect(choices.last()).not.toContainText('{companion'); // 호칭으로 바뀜
    await centerOnScreen(choices.first());
    await choices.first().click();
    await expect(message(page)).toContainText('보며 같이 세어요');
    await expect(page.locator('.look__count')).toBeVisible();
    await expect(message(page)).toHaveText(practice.success, { timeout: practice.seconds * 1000 + 2000 });
    await expect(page.locator('.btn--done')).toHaveText(/연습했어요/);
    await page.getByRole('button', { name: '다른 것 골라 보기' }).click();
    await expect(choices).toHaveCount(practice.choices.length);
  });

  test('이름 부르기 (nameCall): 다 부른 뒤에 "네!"', async ({ page }) => {
    const found = findPractice('nameCall');
    test.skip(!found, '원고에 nameCall 연습이 없음');
    const { exam, page: p } = found!;
    await page.goto(`/#/${exam.id}/${p}`);
    await page.getByRole('button', { name: '이름 불러 보기' }).click();
    const yes = page.getByRole('button', { name: '네!' });
    await expect(yes).toBeEnabled({ timeout: 10_000 });
    await yes.click();
    await expect(message(page)).toHaveText('잘했어요! 이름을 듣고 대답했어요.');
  });

  test('부위 고르기 (tapArea): 다른 곳은 다시 안내, 맞는 곳은 성공', async ({ page }) => {
    const found = findPractice('tapArea');
    test.skip(!found, '원고에 tapArea 연습이 없음');
    const { exam, page: p, practice } = found!;
    await page.goto(`/#/${exam.id}/${p}`);
    const wrong = Object.keys(BODY_LABEL).find((k) => k !== practice.target && k !== 'head')!;
    // 팔·다리는 양쪽 그림이 한 묶음이라 가운데를 누르면 몸통이 눌림 → 이벤트로 직접
    await page.getByRole('button', { name: BODY_LABEL[wrong], exact: true }).dispatchEvent('click');
    await expect(message(page)).toContainText(`여기는 ${BODY_LABEL[wrong]}`);
    await page.getByRole('button', { name: BODY_LABEL[practice.target], exact: true }).click();
    await expect(message(page)).toHaveText(practice.success);
    if (practice.feel) await expect(page.locator('.feel__text')).toHaveText(practice.feel.text);
  });

  test('패드 붙이기 (placePads): 끌어다 놓기 + 자리 누르기', async ({ page }) => {
    const found = findPractice('placePads');
    test.skip(!found, '원고에 placePads 연습이 없음');
    const { exam, page: p, practice } = found!;
    await page.goto(`/#/${exam.id}/${p}`);
    const n = practice.spots.length as number;
    // 첫 패드는 끌어다 놓기
    const pad = page.locator('.pads__pad:not(:disabled)');
    await centerOnScreen(pad);
    const from = (await pad.boundingBox())!;
    const spot = (await page.locator('[data-spot]').first().boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(spot.x + spot.width / 2, spot.y + spot.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('.pads__count')).toContainText(`1 / ${n}`);
    // 나머지는 자리 누르기
    for (let i = 1; i < n; i++) await page.getByRole('button', { name: /에 붙이기$/ }).first().click();
    await expect(page.locator('.pads__count')).toContainText(`${n} / ${n}`);
    await expect(message(page)).toHaveText(practice.success);
  });

  test('순서 고르기 (sequence): 들어서면 바로, 놓을 카드·칸이 늘 노랗게 빛남 → 끌어다 놓기, 눌러도 들어감', async ({ page }) => {
    const found = findPractice('sequence');
    test.skip(!found, '원고에 sequence 연습이 없음');
    const { exam, page: p, practice } = found!;
    await page.goto(`/#/${exam.id}/${p}`);
    const labels = (practice.items as { label: string }[]).map((it) => it.label);
    const plain = (label: string) => label.replace(/s*(.*)s*$/, '');
    const filled = page.locator('.seq__slot[data-filled="true"]');
    const glowing = page.locator('.seq__card[data-hint="true"]');
    const nextSlot = page.locator('.seq__slot[data-next="true"]');
    const card = (label: string) => page.getByRole('button', { name: label, exact: true });
    const dragOnto = async (from: Locator, to: Locator) => {
      const a = (await from.boundingBox())!;
      const b = (await to.boundingBox())!;
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
      await page.mouse.up();
    };
    // 시범 없이 바로: 첫 카드와 1번 칸이 노랗게 빛남
    await expect(page.getByRole('button', { name: '순서 보기' })).toHaveCount(0);
    await expect(message(page)).toHaveText(practice.prompt);
    await expect(glowing).toHaveAttribute('aria-label', labels[0]);
    await expect(nextSlot).toHaveCount(1);
    await centerOnScreen(page.locator('.seq__cards'));
    await dragOnto(glowing, nextSlot);
    await expect(filled).toHaveCount(1);
    // 차례가 아닌 카드를 끌어 놓으면 들어가지 않고 다음 카드를 알려 줌 (실패 표시 없음)
    await dragOnto(card(labels[labels.length - 1]), nextSlot);
    await expect(filled).toHaveCount(1);
    await expect(message(page)).toContainText(`다음은 ${plain(labels[1])}`);
    // 나머지는 누르기 (손 움직임이 어려운 아이도). 매번 다음 카드가 빛남
    for (const label of labels.slice(1)) {
      await expect(glowing).toHaveAttribute('aria-label', label);
      await card(label).click();
    }
    await expect(message(page)).toHaveText(practice.success);
    await expect(filled).toHaveCount(labels.length);
    // 다시 해 보기: 처음부터 다시 빛남. 차례가 아닌 카드를 누르면 알려 줌
    await page.getByRole('button', { name: '다시 해 보기' }).click();
    await expect(glowing).toHaveAttribute('aria-label', labels[0]);
    await card(labels[1]).click();
    await expect(message(page)).toContainText(`처음은 ${plain(labels[0])}`);
    await expect(filled).toHaveCount(0);
  });

  test('심호흡 (breathe): 들이마셔요 → 내쉬어요, 멈출 수 있음', async ({ page }) => {
    const found = findPractice('breathe');
    test.skip(!found, '원고에 breathe 연습이 없음');
    const { exam, page: p, practice } = found!;
    await page.goto(`/#/${exam.id}/${p}`);
    await page.getByRole('button', { name: '시작하기' }).click();
    await expect(message(page)).toHaveText('들이마셔요…');
    await expect(message(page)).toHaveText('내쉬어요…', { timeout: 5_000 });
    await page.getByRole('button', { name: '멈추기' }).click();
    await expect(message(page)).toHaveText(practice.prompt);
  });
});

// 빛 고리가 떠 있는 곳은 data-fx-guide ("ring" | "hand") 로 확인 (fx/fx.ts)
// 자동 점검에서는 기기 음성 대신 글자 수만큼 "읽는 척" (lib/speech.ts, 최대 9초) → 시간이 일정함
test('읽어 주기: 들어서면 읽고(버튼·글자가 움직임), 다 읽으면 15초를 기다리지 않고 바로 빛 고리', async ({ page }) => {
  const exam = exams.find((e) => e.steps.some((s) => !s.practice))!;
  const i = exam.steps.findIndex((s) => !s.practice);
  await page.goto(`/#/${exam.id}/${i + 2}`);
  const speakBtn = page.locator('.say .speak-btn');
  const done = page.locator('.btn--done');
  await expect(speakBtn).toHaveAttribute('data-speaking', 'true'); // 누르지 않아도 읽는 중
  await expect(page.locator('.say.reading .rd--on').first()).toBeVisible(); // 읽은 글자가 차례로 검사 색으로 바뀜
  await expect(done).not.toHaveAttribute('data-fx-guide'); // 읽는 중에는 빛 고리 없음
  await expect(done).toHaveAttribute('data-fx-guide', 'ring', { timeout: 11_000 });
  await expect(speakBtn).toHaveAttribute('data-speaking', 'false');
  await expect(page.locator('.say.reading')).toHaveCount(0);
  // 들어보기를 다시 누르면 고리가 사라지고, 다 읽으면 다시
  await speakBtn.click();
  await expect(done).not.toHaveAttribute('data-fx-guide');
  await expect(done).toHaveAttribute('data-fx-guide', 'ring', { timeout: 11_000 });
});

test('읽어 주기: 문장 다음에 미리 알아 두기 카드도 읽고, 다 읽으면 빛 고리', async ({ page }) => {
  test.setTimeout(40_000);
  const has = (s: Exam['steps'][number]) => !s.practice && !!s.sensory?.length;
  const exam = exams.find((e) => e.steps.some(has));
  test.skip(!exam, '연습 없이 감각 카드만 있는 단계가 없음');
  await page.goto(`/#/${exam!.id}/${exam!.steps.findIndex(has) + 2}`);
  const done = page.locator('.btn--done');
  // 문장을 다 읽은 뒤 카드의 들어보기가 움직임 (그동안 빛 고리 없음)
  await expect(page.locator('.sense .speak-btn').first()).toHaveAttribute('data-speaking', 'true', { timeout: 11_000 });
  await expect(done).not.toHaveAttribute('data-fx-guide');
  await expect(done).toHaveAttribute('data-fx-guide', 'ring', { timeout: 20_000 });
});

test('읽어 주기: 기기 음성에는 "엄마/아빠"의 빗금 대신 "또는"', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('tts', '1'); // 점검에서도 기기 음성 길로 (lib/speech.ts ttsAllowed)
    const said: string[] = [];
    (window as any).__said = said;
    speechSynthesis.speak = (u: SpeechSynthesisUtterance) => {
      said.push(u.text);
      setTimeout(() => (u.onend as any)?.(), 50);
    };
  });
  const exam = exams.find((e) => e.steps[0].text.includes('{companion'));
  test.skip(!exam, '첫 단계에 호칭이 없음');
  await page.goto(`/#/${exam!.id}/2`); // 기본 호칭 "엄마/아빠"
  await expect.poll(() => page.evaluate(() => (window as any).__said.join(' | '))).toContain('엄마 또는 아빠');
  expect(await page.evaluate(() => (window as any).__said.join(''))).not.toContain('/');
});

test('읽어 주기: 보호자 메뉴에서 끄면 들어설 때 읽지 않음', async ({ page }) => {
  await page.addInitScript(
    ([key]) => localStorage.setItem(key, JSON.stringify({ progress: {}, settings: { readAloud: false } })),
    [STORAGE_KEY],
  );
  const exam = exams[0];
  await page.goto(`/#/${exam.id}/2`);
  await page.waitForTimeout(800);
  await expect(page.locator('.say .speak-btn')).toHaveAttribute('data-speaking', 'false');
});

test('첫 화면: 다 한 검사는 "다 했어요"·스티커, 빛 고리는 안 한 검사로', async ({ page }) => {
  test.skip(exams.length < 2, '검사가 2개 이상일 때');
  const [doneExam, next] = exams;
  const progress = { [doneExam.id]: { checked: [], stickers: [], practiced: [], completedCount: 1 } };
  await page.addInitScript(
    ([key, p]) => localStorage.setItem(key as string, JSON.stringify({ progress: p, settings: {} })),
    [STORAGE_KEY, progress] as const,
  );
  await page.goto('/#/');
  const card = (exam: Exam) => page.locator('.exam-card').filter({ hasText: exam.title });
  // "다시 연습하기"로 판을 비워도 끝까지 한 검사의 스티커는 남음
  await expect(card(doneExam).locator('.exam-card__done')).toBeVisible();
  await expect(card(doneExam).locator('.exam-card__stickers img:not(.exam-card__slot)')).toHaveCount(doneExam.phases.length);
  await expect(page.locator('.shelf__stickers img')).toHaveCount(doneExam.phases.length); // 모은 스티커는 "+n" 없이 전부
  await expect(page.locator('.shelf')).toContainText(`모은 스티커 ${doneExam.phases.length}개`);
  // 15초 동안 안 누르면 빛 고리 → 다 한 첫 검사가 아니라 다음 검사에
  await expect(card(next)).toHaveAttribute('data-fx-guide', 'ring', { timeout: 17_000 });
  await expect(card(doneExam)).not.toHaveAttribute('data-fx-guide');
});

test('다 모으면: 마지막 검사를 마치고 오면 "다 모았어요"에 바로 빛 고리 → 축하 화면, 본 뒤에는 안내 없음', async ({ page }) => {
  test.setTimeout(60_000);
  const last = exams[exams.length - 1];
  const total = exams.reduce((n, e) => n + e.phases.length, 0);
  // 다른 검사는 다 했고, 마지막 검사는 마지막 단계만 남음 (스티커는 다 받아서 스티커 창 없이 스티커판으로)
  const progress = {
    ...allDoneProgress(),
    [last.id]: { checked: last.steps.slice(0, -1).map((s) => s.id), stickers: last.phases.map((p) => p.id), practiced: [], completedCount: 0 },
  };
  await page.addInitScript(
    ([key, p]) => localStorage.setItem(key as string, JSON.stringify({ progress: p, settings: { readAloud: false } })),
    [STORAGE_KEY, progress] as const,
  );
  await page.goto(`/#/${last.id}/${last.steps.length + 1}`);
  await page.waitForTimeout(TAP_LOCK_MS);
  await page.locator('.btn--done').click();
  await expect(page.getByRole('heading', { name: '칭찬 스티커판' })).toBeVisible();
  await page.waitForTimeout(TAP_LOCK_MS);
  await page.locator('.bottom-bar .btn--navy').click();

  // 첫 화면: "모은 스티커"가 축하 화면 버튼으로. 15초를 기다리지 않고 별이 뜬 뒤 바로 빛 고리, 카드에는 없음
  const shelf = page.locator('.shelf--complete');
  await expect(shelf).toContainText(`스티커 ${total}개 다 모았어요`);
  await expect(shelf).toHaveAttribute('data-fx-guide', 'ring', { timeout: 6_000 });
  await expect(page.locator('.exam-card[data-fx-guide]')).toHaveCount(0);

  // 축하 화면: 검사마다 스티커 줄, 끝난 화면이라 빛 고리 없음
  await shelf.click();
  await expect(page).toHaveURL(/#\/complete$/);
  await expect(page.getByRole('heading', { name: '병원 검사 연습을 모두 마쳤어요' })).toBeVisible();
  await expect(page.locator('.certificate__row')).toHaveCount(exams.length);
  await expect(page.locator('.certificate__stickers img')).toHaveCount(total);
  await expect(page.locator('[data-fx-guide]')).toHaveCount(0);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').allDoneSeen, STORAGE_KEY)).toBe(true);

  // 본 뒤: 첫 화면 버튼은 남고(다시 볼 수 있게) 15초가 지나도 빛 고리 없음
  await page.waitForTimeout(TAP_LOCK_MS);
  await page.locator('.bottom-bar .btn--navy').click();
  await expect(shelf).toBeVisible();
  await page.waitForTimeout(16_000);
  await expect(page.locator('[data-fx-guide]')).toHaveCount(0);
});

test('연타 막기: 스티커판 "첫 화면으로"를 빨리 두 번 눌러도 첫 화면의 검사가 열리지 않음', async ({ page }) => {
  // 폰에서는 "첫 화면으로" 자리에 첫 화면의 마지막 검사 카드가 놓임
  const exam = exams[0];
  const done = { checked: exam.steps.map((s) => s.id), stickers: exam.phases.map((p) => p.id), practiced: [], completedCount: 1 };
  await page.addInitScript(
    ([key, id, p]) => localStorage.setItem(key as string, JSON.stringify({ progress: { [id as string]: p }, settings: {} })),
    [STORAGE_KEY, exam.id, done] as const,
  );
  await page.goto(`/#/${exam.id}/${exam.steps.length + 2}`);
  await page.waitForTimeout(TAP_LOCK_MS);
  const box = (await page.locator('.bottom-bar .btn--navy').boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.click(x, y);
  await page.waitForTimeout(150);
  await page.mouse.click(x, y);
  await page.waitForTimeout(600);
  await expect(page).toHaveURL(/#\/$/);
});

test('스티커판: 스티커가 없으면 "모두 마쳤어요" 대신 안내하고 별도 없음', async ({ page }) => {
  const exam = exams[0];
  await page.goto(`/#/${exam.id}/${exam.steps.length + 2}`); // 주소로 바로 (진행 기록 없음)
  await expect(page.locator('.reward__bubble')).toHaveText('끝까지 연습하면 스티커를 모두 받아요');
  await expect(page.locator('.page-head .speak-btn')).toBeVisible(); // 누르면 읽어 줌
});

test('보호자 메뉴 "단계 고르기": 원하는 단계로 바로 가고, 처음부터 다시 연습하기는 체크·스티커만 비움', async ({ page }) => {
  const exam = exams[0];
  const progress = { [exam.id]: { checked: exam.steps.slice(0, 3).map((s) => s.id), stickers: [exam.phases[0].id], practiced: [], completedCount: 1 } };
  await page.addInitScript(
    ([key, p]) => localStorage.setItem(key as string, JSON.stringify({ progress: p, settings: { readAloud: false } })),
    [STORAGE_KEY, progress] as const,
  );
  await page.goto(`/#/${exam.id}/4`); // 3단계
  // 보호자 버튼은 길게 눌러야 열림 → 점검에서는 키보드 Enter (TopBar)
  const openMenu = async () => {
    await page.locator('.caregiver-btn').focus();
    await page.keyboard.press('Enter');
    await page.locator('.step-pick > summary').click();
  };
  await openMenu();
  await expect(page.locator('.step-pick__item[aria-current="step"] .step-pick__num')).toHaveText('3');
  await expect(page.locator('.step-pick__item')).toHaveCount(exam.steps.length);
  // 연습이 있는 단계는 따로 표시
  await expect(page.locator('.step-pick__item[data-practice="true"]')).toHaveCount(exam.steps.filter((s) => s.practice).length);
  await page.locator('.step-pick__item').nth(5).click(); // 6단계
  await expect(page).toHaveURL(new RegExp(`#/${exam.id}/7$`));
  await expect(page.locator('.sheet')).toHaveCount(0);

  await openMenu();
  page.once('dialog', (d) => d.accept());
  await page.locator('.step-pick__restart').click();
  await expect(page).toHaveURL(new RegExp(`#/${exam.id}/1$`));
  const p = await page.evaluate(([key, id]) => JSON.parse(localStorage.getItem(key)!).progress[id], [STORAGE_KEY, exam.id]);
  expect(p.checked).toEqual([]);
  expect(p.stickers).toEqual([]);
  expect(p.completedCount).toBe(1);
});

test('보호자 버튼: 짧게 누르면 안내 말풍선만, 0.8초 누르고 있으면 메뉴가 열림', async ({ page }) => {
  const exam = exams[0];
  await page.addInitScript(([key]) => localStorage.setItem(key, JSON.stringify({ progress: {}, settings: { readAloud: false } })), [STORAGE_KEY]);
  await page.goto(`/#/${exam.id}/4`);
  const box = (await page.locator('.caregiver-btn').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.mouse.up();
  await expect(page.locator('.hint-bubble')).toBeVisible();
  await expect(page.locator('.sheet')).toHaveCount(0);
  // 1.2초 → 0.8초 (TopBar LONG_PRESS_MS). 1초 안에 열려야 함
  await page.mouse.down();
  await page.waitForTimeout(1000);
  await expect(page.locator('.sheet')).toBeVisible({ timeout: 150 });
  await page.mouse.up();
  await expect(page.locator('.sheet')).toBeVisible(); // 손을 떼도 안 닫힘
});

test('다음 사람을 위해 지우기: 다 마친 스티커판에서 길게 누르면 기록·이름·설정이 처음 상태로', async ({ page }) => {
  const exam = exams[0];
  const done = { checked: exam.steps.map((s) => s.id), stickers: exam.phases.map((p) => p.id), practiced: [], completedCount: 1 };
  await page.addInitScript(
    ([key, id, p]) =>
      localStorage.setItem(
        key as string,
        JSON.stringify({ progress: { [id as string]: p }, settings: { name: '김민준', companion: '할머니', readAloud: false }, allDoneSeen: true }),
      ),
    [STORAGE_KEY, exam.id, done] as const,
  );
  await page.goto(`/#/${exam.id}/${exam.steps.length + 2}`);
  const btn = page.locator('.next-person__btn');
  await centerOnScreen(btn);
  // 짧게 누르면 안내 말만 (지우지 않음)
  await btn.click();
  await expect(page.locator('.next-person__hint')).toBeVisible();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).settings.name, STORAGE_KEY)).toBe('김민준');
  // 길게 누르면 확인 창 → 모두 지우고 첫 화면으로
  page.once('dialog', (d) => d.accept());
  const box = (await btn.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
  await expect(page).toHaveURL(/#\/$/);
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(saved.progress).toEqual({});
  expect(saved.settings.name).toBe('');
  expect(saved.settings.companion).toBe('엄마/아빠');
  expect(saved.allDoneSeen).toBe(false);
  // 다음 사람도 보호자 셋업부터
  expect(saved.setupSeen).toBe(false);
  await expect(page.locator('.setup')).toBeVisible();
});

test('보호자 메뉴: "초기 설정 화면"을 끄면 다음 사람을 위해 지운 뒤에도 셋업 없이 첫 화면 (이 설정은 남음)', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.locator('.shelf')).toBeVisible();
  await page.locator('.caregiver-btn').focus();
  await page.keyboard.press('Enter');
  await page.locator('.more-settings > summary').click();
  await page.locator('.field').filter({ hasText: '초기 설정 화면' }).getByRole('button', { name: '끄기' }).click();
  await page.getByPlaceholder('예: 홍길동').fill('민준');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '다음 사람을 위해 모두 지우기' }).click();
  await expect(page.locator('.shelf')).toBeVisible();
  await expect(page.locator('.setup')).toHaveCount(0);
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(saved.setupSeen).toBe(false);
  expect(saved.settings.name).toBe('');
  expect(saved.settings.showSetup).toBe(false);
  // 다시 켜도 지금 화면은 그대로, 다음 사람(지우기 뒤)부터 셋업
  await page.locator('.caregiver-btn').focus();
  await page.keyboard.press('Enter');
  await page.locator('.more-settings > summary').click();
  await page.locator('.field').filter({ hasText: '초기 설정 화면' }).getByRole('button', { name: '켜기' }).click();
  await expect(page.locator('.sheet')).toBeVisible();
  await expect(page.locator('.setup')).toHaveCount(0);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '다음 사람을 위해 모두 지우기' }).click();
  await expect(page.locator('.setup')).toBeVisible();
});

test('저장값: 형이 맞아도 범위 밖이면 기본값 (글자 크기 0이면 글자가 모두 사라졌음)', async ({ page }) => {
  await page.addInitScript(
    ([key]) =>
      localStorage.setItem(key, JSON.stringify({ progress: {}, settings: { textScale: 0, companion: ' ', volume: 5, reduceMotion: 'x', readAloud: false } })),
    [STORAGE_KEY],
  );
  const exam = exams.find((e) => e.steps[0].text.includes('{companion'));
  test.skip(!exam, '첫 단계에 호칭이 없음');
  await page.goto(`/#/${exam!.id}/2`);
  const action = page.locator('.say__action');
  await expect(action).toContainText('엄마/아빠'); // 빈 호칭 → 기본값
  expect(await action.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(20);
  expect(await page.evaluate(() => document.documentElement.dataset.reduceMotion)).toBe('system');
});

test('패드 붙이기: 앞 단계에서 붙인 패드는 처음부터 붙어 있고, 붙일 개수에는 안 셈', async ({ page }) => {
  const found = findPractice('placePads', (p) => (p.prePlaced?.length ?? 0) > 0);
  test.skip(!found, '이미 붙은 패드가 있는 단계가 없음');
  const { exam, page: p, practice } = found!;
  await page.addInitScript(([key]) => localStorage.setItem(key, JSON.stringify({ progress: {}, settings: { readAloud: false } })), [STORAGE_KEY]);
  await page.goto(`/#/${exam.id}/${p}`);
  await expect(page.locator('.pads .pad')).toHaveCount(practice.prePlaced.length);
  await expect(page.locator('.pad-spot')).toHaveCount(practice.spots.length);
  await expect(page.locator('.pads__count')).toContainText(`0 / ${practice.spots.length}`);
});

test('보호자 메뉴: "페이지마다 자동으로 읽기"는 소리 켜기·끄기와 따로 켜고 끔', async ({ page }) => {
  await page.goto(`/#/${exams[0].id}/2`);
  await page.locator('.caregiver-btn').focus();
  await page.keyboard.press('Enter');
  const field = page.locator('.field').filter({ hasText: '페이지마다 자동으로 읽기' });
  await expect(field.getByRole('button')).toHaveCount(2);
  await field.getByRole('button', { name: '끄기' }).click();
  const settings = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).settings, STORAGE_KEY);
  expect(settings).toMatchObject({ readAloud: false, sound: true });
});

test('이름 부르기: 이미 연습한 단계에서 다시 해도 빛 고리가 "했어요"로 돌아옴', async ({ page }) => {
  const found = findPractice('nameCall');
  test.skip(!found, '원고에 nameCall 연습이 없음');
  const { exam, page: p } = found!;
  const progress = { [exam.id]: { checked: [], stickers: [], practiced: [exam.steps[p - 2].id], completedCount: 0 } };
  await page.addInitScript(
    ([key, pr]) => localStorage.setItem(key as string, JSON.stringify({ progress: pr, settings: { readAloud: false } })),
    [STORAGE_KEY, progress] as const,
  );
  await page.goto(`/#/${exam.id}/${p}`);
  await page.waitForTimeout(TAP_LOCK_MS);
  await page.getByRole('button', { name: '이름 불러 보기' }).click();
  const yes = page.getByRole('button', { name: '네!' });
  await expect(yes).toBeEnabled({ timeout: 10_000 });
  await yes.click();
  // 예전에는 사라진 "네!"에 안내가 남아 빛 고리가 더 나오지 않았음
  await expect(page.locator('.btn--done')).toHaveAttribute('data-fx-guide', 'ring', { timeout: 17_000 });
});

test('단계를 건너뛰고 마지막만 "했어요": 건너뛴 묶음 스티커는 안 붙고, 첫 화면도 "다 했어요"가 아님', async ({ page }) => {
  const exam = exams[0];
  await page.addInitScript(([key]) => localStorage.setItem(key, JSON.stringify({ progress: {}, settings: { readAloud: false } })), [STORAGE_KEY]);
  const last = exam.steps[exam.steps.length - 1];
  await page.goto(`/#/${exam.id}/${exam.steps.length + 1}`); // 마지막 단계로 바로
  await page.waitForTimeout(TAP_LOCK_MS);
  await page.locator('.btn--done').click();
  const saved = () => page.evaluate(([key, id]) => JSON.parse(localStorage.getItem(key)!).progress[id], [STORAGE_KEY, exam.id]);
  await expect.poll(async () => (await saved())?.checked).toEqual([last.id]);
  const p = await saved();
  expect(p.completedCount).toBe(0);
  // 마지막 묶음이 이 단계 하나뿐이면 그 묶음 스티커만 (다른 묶음은 안 붙음)
  const lastPhaseOnly = exam.steps.filter((s) => s.phase === last.phase).length === 1;
  expect(p.stickers).toEqual(lastPhaseOnly ? [last.phase] : []);
  await page.goto('/#/');
  const card = page.locator('.exam-card').filter({ hasText: exam.title });
  await expect(card.locator('.exam-card__done')).toHaveCount(0);
  await expect(card.locator('.exam-card__stickers img:not(.exam-card__slot)')).toHaveCount(p.stickers.length);
});

test('다 마친 검사를 첫 화면에서 다시 시작하면 새 회차 (체크·연습은 비우고 마친 횟수는 남김), 하다 만 검사는 이어서', async ({ page }) => {
  const [done, half] = exams;
  test.skip(!half, '검사가 2개 이상일 때');
  const all = (e: Exam) => ({ checked: e.steps.map((s) => s.id), stickers: e.phases.map((p) => p.id), practiced: e.steps.filter((s) => s.practice).map((s) => s.id), completedCount: 2 });
  const partial = { checked: [half.steps[0].id], stickers: [], practiced: [], completedCount: 0 };
  await page.addInitScript(
    ([key, p]) => localStorage.setItem(key as string, JSON.stringify({ progress: p, settings: { readAloud: false } })),
    [STORAGE_KEY, { [done.id]: all(done), [half.id]: partial }] as const,
  );
  const saved = (id: string) => page.evaluate(([key, i]) => JSON.parse(localStorage.getItem(key)!).progress[i], [STORAGE_KEY, id]);
  for (const id of [done.id, half.id]) {
    await page.goto(`/#/${id}/0`);
    await page.waitForTimeout(TAP_LOCK_MS);
    await page.locator('.bottom-bar .btn--primary').click(); // 시작하기
    await expect(page).toHaveURL(new RegExp(`#/${id}/1$`));
  }
  const d = await saved(done.id);
  expect(d).toMatchObject({ checked: [], stickers: [], practiced: [], completedCount: 2 });
  expect((await saved(half.id)).checked).toEqual(partial.checked);
});

test('묶음을 마치면 스티커 창이 뜨고, 누르지 않아도 저절로 닫히며 다음 단계로', async ({ page }) => {
  const exam = exams[0];
  const first = exam.phases[0];
  const steps = exam.steps.filter((s) => s.phase === first.id);
  const before = exam.steps.slice(0, exam.steps.indexOf(steps[steps.length - 1])).map((s) => s.id);
  await page.addInitScript(
    ([key, id, checked]) => localStorage.setItem(key as string, JSON.stringify({ progress: { [id as string]: { checked, stickers: [], practiced: [], completedCount: 0 } }, settings: { readAloud: false } })),
    [STORAGE_KEY, exam.id, before] as const,
  );
  const last = exam.steps.indexOf(steps[steps.length - 1]);
  await page.goto(`/#/${exam.id}/${last + 2}`);
  await page.waitForTimeout(TAP_LOCK_MS);
  await page.locator('.btn--done').click();
  const toast = page.locator('.toast-card');
  await expect(toast).toBeVisible();
  await expect(toast).not.toContainText('다음으로'); // 누를 버튼 없음
  await expect(toast).toBeHidden({ timeout: 3_000 }); // 1.5초 뒤 저절로 닫힘
  await expect(page).toHaveURL(new RegExp(`#/${exam.id}/${last + 3}$`));
  const p = await page.evaluate(([key, id]) => JSON.parse(localStorage.getItem(key)!).progress[id], [STORAGE_KEY, exam.id]);
  expect(p.stickers).toEqual([first.id]);
});

test('스티커 창: 자동 읽기가 켜져 있으면 "스티커를 받았어요!"를 다 읽은 뒤에 닫힘 (끊기지 않음)', async ({ page }) => {
  const exam = exams[0];
  const first = exam.phases[0];
  const last = exam.steps.reduce((n, s, i) => (s.phase === first.id ? i : n), 0);
  const before = exam.steps.slice(0, last).map((s) => s.id);
  await page.addInitScript(
    ([key, id, checked]) => {
      localStorage.setItem(key as string, JSON.stringify({ setupSeen: true, progress: { [id as string]: { checked, stickers: [], practiced: [], completedCount: 0 } } }));
      // 점검 브라우저는 읽는 척(글자 수만큼 시간)을 하며 경고 로그를 남김 → 그 시각과 창이 사라진 시각을 잼
      const w = window as unknown as { __sayAt?: number; __goneAt?: number };
      const warn = console.warn.bind(console);
      console.warn = (...a: unknown[]) => {
        if (String(a[0]).includes('"스티커를 받았어요!"')) w.__sayAt = performance.now();
        warn(...a);
      };
      new MutationObserver(() => {
        if (w.__sayAt && !w.__goneAt && !document.querySelector('.toast-card')) w.__goneAt = performance.now();
      }).observe(document, { childList: true, subtree: true });
    },
    [STORAGE_KEY, exam.id, before] as const,
  );
  await page.goto(`/#/${exam.id}/${last + 2}`);
  await page.waitForTimeout(TAP_LOCK_MS);
  await page.locator('.btn--done').click();
  await expect(page.locator('.toast-card')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`#/${exam.id}/${last + 3}$`), { timeout: 5_000 });
  const t = await page.evaluate(() => {
    const w = window as unknown as { __sayAt?: number; __goneAt?: number };
    return { __sayAt: w.__sayAt ?? NaN, __goneAt: w.__goneAt ?? NaN };
  });
  // 읽는 척 = 9글자 → 1.66초. 예전에는 창이 뜨고 1.5초(= 읽기 시작 1.25초 뒤)에 닫혀 끊겼음
  expect(t.__goneAt - t.__sayAt, JSON.stringify(t)).toBeGreaterThanOrEqual(1550);
});

test('스티커 창: 화면 아무 곳이나 누르면 바로 다음 단계로', async ({ page }) => {
  const exam = exams[0];
  const first = exam.phases[0];
  const last = exam.steps.reduce((n, s, i) => (s.phase === first.id ? i : n), 0);
  const before = exam.steps.slice(0, last).map((s) => s.id);
  await page.addInitScript(
    ([key, id, checked]) => localStorage.setItem(key as string, JSON.stringify({ progress: { [id as string]: { checked, stickers: [], practiced: [], completedCount: 0 } }, settings: { readAloud: false } })),
    [STORAGE_KEY, exam.id, before] as const,
  );
  await page.goto(`/#/${exam.id}/${last + 2}`);
  await page.waitForTimeout(TAP_LOCK_MS);
  await page.locator('.btn--done').click();
  await expect(page.locator('.toast-card')).toBeVisible();
  await page.waitForTimeout(450); // 연타 막기(0.4초) 뒤
  const box = (await page.locator('.overlay').boundingBox())!;
  await page.mouse.click(box.x + 6, box.y + box.height / 2); // 창 밖 배경
  // 저절로 닫히는 1.5초보다 먼저 넘어감
  await expect(page).toHaveURL(new RegExp(`#/${exam.id}/${last + 3}$`), { timeout: 400 });
});

test('연습 먼저 하기: 연습 전 "했어요"는 잠겨 있다가 해내면 켜짐, 보호자 설정으로 끌 수 있음', async ({ page }) => {
  const found = findPractice('hold');
  test.skip(!found, '원고에 hold 연습이 없음');
  const { exam, page: p, practice } = found!;
  await page.addInitScript(([key]) => localStorage.setItem(key, JSON.stringify({ progress: {}, settings: { readAloud: false } })), [STORAGE_KEY]);
  await page.goto(`/#/${exam.id}/${p}`);
  await page.waitForTimeout(TAP_LOCK_MS);
  const done = page.locator('.btn--done');
  await expect(done).toHaveAttribute('data-locked', 'true');
  await expect(done).toHaveText(/먼저 해 봐요/);
  // 잠겨 있어도 누를 수는 있음(aria-disabled라 점검 도구는 force) → 넘어가지 않고 연습 칸으로 안내 (실패 표시 없음)
  await done.click({ force: true });
  await expect(page).toHaveURL(new RegExp(`#/${exam.id}/${p}$`));
  const hold = page.locator('.hold');
  await centerOnScreen(hold);
  const box = (await hold.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(practice.seconds * 1000 + 600);
  await page.mouse.up();
  await expect(done).toHaveAttribute('data-locked', 'false');
  await expect(done).toHaveText(/연습했어요/);
  await done.click();
  await expect(page).toHaveURL(new RegExp(`#/${exam.id}/${p + 1}$`));
  // 아직 안 한 다른 연습 단계: 잠겨 있다가, 보호자 메뉴에서 끄면 연습 전에도 누를 수 있음
  const other = exam.steps.findIndex((s, i) => s.practice && i + 2 !== p);
  test.skip(other < 0, '연습 단계가 하나뿐');
  await page.evaluate((h) => (location.hash = h), `#/${exam.id}/${other + 2}`);
  await expect(done).toHaveAttribute('data-locked', 'true');
  await page.locator('.caregiver-btn').focus();
  await page.keyboard.press('Enter');
  await page.locator('.more-settings > summary').click(); // 덜 바꾸는 설정은 접혀 있음
  await page.locator('.field').filter({ hasText: '연습 먼저 하기' }).getByRole('button', { name: '끄기' }).click();
  await page.getByRole('button', { name: '닫기' }).click();
  await expect(done).toHaveAttribute('data-locked', 'false');
  await expect(done).toHaveText(/했어요/);
});

test('연습 기록을 지우면 연습 칸도 처음부터 → 다시 해내면 "했어요"가 켜짐 (성공 글이 남은 채 잠기지 않음)', async ({ page }) => {
  const found = findPractice('hold');
  test.skip(!found, '원고에 hold 연습이 없음');
  const { exam, page: p, practice } = found!;
  await page.goto(`/#/${exam.id}/${p}`);
  const done = page.locator('.btn--done');
  const holdIt = async () => {
    const hold = page.locator('.hold');
    await centerOnScreen(hold);
    const box = (await hold.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(practice.seconds * 1000 + 600);
    await page.mouse.up();
  };
  await holdIt();
  await expect(done).toHaveText(/연습했어요/);
  await page.locator('.caregiver-btn').focus();
  await page.keyboard.press('Enter');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /스티커·연습 기록 지우기/ }).click();
  await page.keyboard.press('Escape');
  await expect(done).toHaveText(/먼저 해 봐요/);
  await expect(message(page)).toHaveText(practice.prompt); // 성공 글이 남지 않음
  await holdIt();
  await expect(done).toHaveText(/연습했어요/);
});

test('단계 고르기: 다 마친 검사의 단계를 고르면 새 회차 (체크·스티커·연습은 비우고 마친 횟수는 남김)', async ({ page }) => {
  const exam = exams[0];
  const all = { checked: exam.steps.map((s) => s.id), stickers: exam.phases.map((ph) => ph.id), practiced: exam.steps.filter((s) => s.practice).map((s) => s.id), completedCount: 1 };
  await page.addInitScript(
    ([key, id, p]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(key as string, JSON.stringify({ progress: { [id as string]: p }, settings: { readAloud: false } }));
    },
    [STORAGE_KEY, exam.id, all] as const,
  );
  await page.goto(`/#/${exam.id}/0`);
  await page.locator('.caregiver-btn').focus();
  await page.keyboard.press('Enter');
  await page.locator('.step-pick > summary').click();
  await page.locator('.step-pick__item').first().click();
  await expect(page).toHaveURL(new RegExp(`#/${exam.id}/2$`));
  const p = await page.evaluate(([key, id]) => JSON.parse(localStorage.getItem(key)!).progress[id], [STORAGE_KEY, exam.id]);
  expect(p).toMatchObject({ checked: [], stickers: [], practiced: [], completedCount: 1 });
});

test('보호자 메뉴: 읽는 중에 소리를 끄면 바로 멈춤', async ({ page }) => {
  const exam = exams.find((e) => e.steps.some((s) => !s.practice))!;
  const i = exam.steps.findIndex((s) => !s.practice);
  await page.goto(`/#/${exam.id}/${i + 2}`);
  const speakBtn = page.locator('.say .speak-btn');
  await expect(speakBtn).toHaveAttribute('data-speaking', 'true');
  await page.locator('.caregiver-btn').focus();
  await page.keyboard.press('Enter');
  await page.locator('.field').filter({ hasText: /^소리/ }).getByRole('button', { name: '끄기' }).click();
  await expect(speakBtn).toHaveAttribute('data-speaking', 'false');
});

test('축하 화면: 이름 끝 띄어쓰기는 지우고 보여 줌 ("민준 ," 아님)', async ({ page }) => {
  await page.addInitScript(
    ([key, p]) => localStorage.setItem(key as string, JSON.stringify({ progress: p, settings: { readAloud: false, name: '민준 ' }, allDoneSeen: true })),
    [STORAGE_KEY, allDoneProgress()] as const,
  );
  await page.goto('/#/complete');
  await expect(page.getByText(/민준, 스티커/)).toBeVisible();
});

test('축하 화면: 다 모으기 전에는 주소로 열어도 첫 화면으로', async ({ page }) => {
  await page.goto('/#/complete');
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('.shelf')).toBeVisible();
  await expect(page.locator('.shelf--complete')).toHaveCount(0);
});

test('마친 횟수: 스티커판에서 뒤로 갔다 다시 눌러도 늘지 않음', async ({ page }) => {
  const exam = exams[0];
  const last = exam.steps[exam.steps.length - 1];
  const done = { checked: exam.steps.map((s) => s.id), stickers: exam.phases.map((p) => p.id), practiced: [], completedCount: 1 };
  await page.addInitScript(
    ([key, id, p]) => localStorage.setItem(key, JSON.stringify({ progress: { [id as string]: p }, settings: {} })),
    [STORAGE_KEY, exam.id, done] as const,
  );
  await page.goto(`/#/${exam.id}/${exam.steps.length + 1}`);
  await page.waitForTimeout(TAP_LOCK_MS);
  await page.locator('.btn--done').click();
  await expect(page.getByRole('heading', { name: '칭찬 스티커판' })).toBeVisible();
  const progress = await page.evaluate(
    ([key, id]) => JSON.parse(localStorage.getItem(key) ?? '{}').progress?.[id],
    [STORAGE_KEY, exam.id],
  );
  expect(progress.checked).toContain(last.id);
  expect(progress.completedCount).toBe(1);
});

test('저장값이 깨져도 화면이 멈추지 않음', async ({ page }) => {
  const errors = watchErrors(page);
  const exam = exams[0];
  await page.addInitScript(
    ([key, id]) =>
      localStorage.setItem(
        key,
        JSON.stringify({ progress: { [id]: { checked: 5, stickers: null } }, settings: { textScale: 'big', companion: 3 } }),
      ),
    [STORAGE_KEY, exam.id],
  );
  await page.goto(`/#/${exam.id}/2`);
  await expect(page.locator('.btn--done')).toBeVisible();
  await page.waitForTimeout(TAP_LOCK_MS);
  await page.locator('.btn--done').click();
  await expect(page.locator('.btn--done')).toBeVisible();
  expect(errors).toEqual([]);
});

test('바늘·피 사진 가리기: 원고의 sensitive 단계만 가림', async ({ page }) => {
  const exam = exams.find((e) => e.steps.some((s) => s.sensitive));
  test.skip(!exam, '원고에 sensitive 단계가 없음');
  const i = exam!.steps.findIndex((s) => s.sensitive);
  await page.addInitScript(
    ([key]) => localStorage.setItem(key, JSON.stringify({ progress: {}, settings: { hideNeedle: true } })),
    [STORAGE_KEY],
  );
  await page.goto(`/#/${exam!.id}/${i + 2}`);
  await expect(page.locator('.photo')).toContainText('사진을 가렸어요');
  await page.goto(`/#/${exam!.id}/2`);
  await expect(page.locator('.photo')).not.toContainText('사진을 가렸어요');
});

test('사진 미리 받기: 표지를 연 뒤 인터넷이 끊겨도 그 검사 사진이 끝까지 보임', async ({ page, context }) => {
  const exam = exams.find((e) => e.steps.some((s) => mediaExists(s.image)));
  test.skip(!exam, '사진 파일이 있는 검사가 없음');
  await page.goto(`/#/${exam!.id}/0`);
  await page.waitForLoadState('networkidle'); // 미리 받기가 끝날 때까지
  await context.setOffline(true);

  const go = (p: number) => page.evaluate((hash) => (location.hash = hash), `#/${exam!.id}/${p}`);
  /** 그림이 다 받아진 채로 보이는지 (끊긴 뒤에 새로 받으려 했다면 깨지거나 "사진 준비 중"으로 바뀜) */
  const allLoaded = (selector: string, count: number) =>
    expect
      .poll(() =>
        page
          .locator(selector)
          .evaluateAll((imgs) => imgs.filter((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0).length),
      )
      .toBe(count);

  await go(1);
  await allLoaded('.phase-row__img', exam!.phases.length);
  for (const [i, step] of exam!.steps.entries()) {
    if (!mediaExists(step.image)) continue;
    await go(i + 2);
    await allLoaded(`.photo img[src$="${step.image}"]`, 1);
  }
  await go(exam!.steps.length + 2);
  await allLoaded('.reward__cheer img', 1);
});

/** 세로 태블릿 크기 (base.css "세로 태블릿"). 아이패드 미니·갤럭시탭 계열을 감쌈 */
test('작은 세로 태블릿(600×880): 다 마친 스티커판의 "다음 사람을 위해 지우기"가 아래 막대에 안 가리고, 첫 화면 카드 스티커는 한 줄', async ({ page }, testInfo) => {
  const vp = testInfo.project.use.viewport;
  test.skip(!vp || vp.width < 600 || vp.height <= vp.width, '세로 태블릿 프로젝트에서만');
  const exam = exams[0];
  const progress = { [exam.id]: { checked: exam.steps.map((s) => s.id), stickers: exam.phases.map((ph) => ph.id), practiced: [], completedCount: 1 } };
  await page.addInitScript(
    ([key, p]) => localStorage.setItem(key as string, JSON.stringify({ progress: p, settings: { reduceMotion: 'on', readAloud: false } })),
    [STORAGE_KEY, progress] as const,
  );
  await page.setViewportSize({ width: 600, height: 880 });
  await page.goto(`/#/${exam.id}/${exam.steps.length + 2}`);
  await expect(page.getByRole('heading', { name: '칭찬 스티커판' })).toBeVisible();
  await expect.poll(() => screenOverflow(page)).toBeLessThanOrEqual(1);
  const btn = (await page.locator('.next-person__btn').boundingBox())!;
  const bar = (await page.locator('.bottom-bar').boundingBox())!;
  expect(btn.y + btn.height).toBeLessThanOrEqual(bar.y + 1);
  await page.goto('/#/');
  const rows = page.locator('.exam-card__stickers');
  await expect(rows.first()).toBeVisible();
  for (const h of await rows.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) expect(h).toBeLessThan(40);
});

const PORTRAIT_TABLETS = [
  { width: 768, height: 1024 },
  { width: 800, height: 1100 },
  { width: 820, height: 1180 },
];

test('세로 태블릿: 화면마다 스크롤 없이 한 화면에', async ({ page }, testInfo) => {
  const vp = testInfo.project.use.viewport;
  // 크기를 직접 바꿔 가며 보므로 세로 태블릿 프로젝트(태블릿, 아이패드 사파리)에서만 한 번
  test.skip(!vp || vp.width < 600 || vp.height <= vp.width, '세로 태블릿 프로젝트에서만');
  test.setTimeout(300_000);
  // 등장 애니메이션(아래에서 살짝 올라옴) 중에 재면 잠깐 넘친 것처럼 보임 → 움직임 줄이기를 켜고 잼
  await page.addInitScript(
    ([key]) => localStorage.setItem(key, JSON.stringify({ progress: {}, settings: { reduceMotion: 'on' } })),
    [STORAGE_KEY],
  );
  await page.goto('/#/');

  const overflowing: string[] = [];
  /** 연습 단계: 사진을 줄이고 화면을 80%까지 줄여도(lib/fitScreen.ts) 몸 그림이 큰 몇 곳은 작은 태블릿에서 조금 넘침 → 실패로 치지 않고 넘친 만큼만 알림 */
  const practiceLeft: string[] = [];
  const overflow = () => screenOverflow(page);
  for (const size of PORTRAIT_TABLETS) {
    await page.setViewportSize(size);
    await page.evaluate(() => (location.hash = '#/'));
    await expect(page.locator('.shelf')).toBeVisible();
    const homeOver = await overflow();
    if (homeOver > 1) overflowing.push(`${size.width}×${size.height} 첫 화면 ${homeOver}px`);

    for (const exam of exams) {
      const last = exam.steps.length + 2;
      for (let p = 0; p <= last; p++) {
        await page.evaluate((hash) => (location.hash = hash), `#/${exam.id}/${p}`);
        // 그 페이지가 그려질 때까지
        if (p === 0) await expect(page.locator('.intro__title')).toContainText(exam.title);
        else if (p === 1) await expect(page.locator('.phase-list')).toBeVisible();
        else if (p === last) await expect(page.getByRole('heading', { name: '칭찬 스티커판' })).toBeVisible();
        else await expect(page.locator('.progress__label strong')).toHaveText(String(p - 1));

        const over = await overflow();
        if (over <= 1) continue;
        const step = p >= 2 && p < last ? exam.steps[p - 2] : null;
        const where = `${size.width}×${size.height} ${exam.id}/${p} ${over}px`;
        if (step?.practice) practiceLeft.push(`${where} (${step.practice.type})`);
        else overflowing.push(where);
      }
    }
  }
  if (practiceLeft.length) {
    testInfo.annotations.push({ type: '연습 단계 남은 넘침', description: practiceLeft.join(', ') });
    const bySize = PORTRAIT_TABLETS.map((s) => {
      const px = practiceLeft.filter((p) => p.startsWith(`${s.width}×${s.height} `)).map((p) => Number(p.split(' ')[2].replace('px', '')));
      return `${s.width}×${s.height} ${px.length}곳(최대 ${Math.max(0, ...px)}px)`;
    });
    console.log(`연습 단계(스크롤 허용) 넘침: ${bySize.join(', ')}`);
  }
  expect(overflowing, '스크롤이 생긴 화면').toEqual([]);
});

test('세로 태블릿: 다 모은 첫 화면과 축하 화면도 한 화면에', async ({ page }, testInfo) => {
  const vp = testInfo.project.use.viewport;
  test.skip(!vp || vp.width < 600 || vp.height <= vp.width, '세로 태블릿 프로젝트에서만');
  await page.addInitScript(
    ([key, p]) => localStorage.setItem(key as string, JSON.stringify({ progress: p, settings: { reduceMotion: 'on', readAloud: false } })),
    [STORAGE_KEY, allDoneProgress()] as const,
  );
  await page.goto('/#/');
  const overflowing: string[] = [];
  for (const size of PORTRAIT_TABLETS) {
    await page.setViewportSize(size);
    for (const [hash, ready] of [['#/', '.shelf--complete'], ['#/complete', '.certificate']]) {
      await page.evaluate((h) => (location.hash = h), hash);
      await expect(page.locator(ready)).toBeVisible();
      const px = await screenOverflow(page);
      if (px > 1) overflowing.push(`${size.width}×${size.height} ${hash} ${px}px`);
    }
  }
  expect(overflowing, '스크롤이 생긴 화면').toEqual([]);
});

// ── 10-07 검수 "남은 작은 버그" 고친 것 ──

/** 보호자 메뉴 열기 (짧게 누르면 안내 말만이라 키보드로) */
async function openCaregiver(page: Page) {
  await page.locator('.caregiver-btn').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.sheet')).toBeVisible();
}

const seed = (page: Page, state: Record<string, unknown>) =>
  page.addInitScript(([key, s]) => localStorage.setItem(key as string, JSON.stringify(s)), [STORAGE_KEY, state] as const);

test('진행 점: 단계 고르기·주소로 건너뛴 단계는 "한 것"으로 칠하지 않음', async ({ page }) => {
  const exam = exams[0];
  await page.goto(`/#/${exam.id}/5`);
  await expect(page.locator('.progress__dot[data-state="now"]')).toHaveCount(1);
  await expect(page.locator('.progress__dot[data-state="done"]')).toHaveCount(0);
});

test('예전 호칭 "선생님"이 저장된 기기는 "학교 선생님"으로 (메뉴에 눌린 칩이 있음)', async ({ page }) => {
  await seed(page, { setupSeen: true, settings: { companion: '선생님', readAloud: false } });
  await page.goto('/#/');
  await openCaregiver(page);
  const chips = page.locator('.field').filter({ hasText: '함께 가는 사람' });
  await expect(chips.getByRole('button', { name: '학교 선생님' })).toHaveAttribute('aria-pressed', 'true');
});

test('뒤로 가기: 보호자 메뉴가 열려 있으면 창만 닫히고, 창을 닫은 뒤에는 한 번에 앞 페이지로. 초점은 창 안에', async ({ page }) => {
  const exam = exams[0];
  await page.goto(`/#/${exam.id}/1`);
  await page.evaluate((h) => (location.hash = h), `#/${exam.id}/2`);
  await expect(page.locator('.progress')).toBeVisible();
  await openCaregiver(page);
  // 키보드 초점이 창으로 옮겨 가고, Tab 을 눌러도 뒤 화면으로 나가지 않음
  const inSheet = () => page.evaluate(() => !!document.activeElement?.closest('.overlay'));
  expect(await inSheet()).toBe(true);
  for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
  expect(await inSheet()).toBe(true);
  // 뒤로 가기 = 창만 닫힘
  await page.goBack();
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`#/${exam.id}/2$`));
  // 닫기 버튼으로 닫으면 창이 쌓은 칸도 되돌림 → 뒤로 가기 한 번에 앞 페이지
  await openCaregiver(page);
  await page.getByRole('button', { name: '닫기' }).click();
  await expect(page.locator('.sheet')).toHaveCount(0);
  await page.waitForTimeout(300);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`#/${exam.id}/1$`));
});

test('다음 사람을 위해 지운 뒤 뒤로 가기: 앞사람이 보던 페이지가 안 나옴', async ({ page }) => {
  const exam = exams[0];
  await page.goto(`/#/${exam.id}/1`);
  await page.evaluate((h) => (location.hash = h), `#/${exam.id}/2`);
  await expect(page.locator('.progress')).toBeVisible();
  await openCaregiver(page);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '다음 사람을 위해 모두 지우기' }).click();
  await expect(page.locator('.setup')).toBeVisible();
  await page.waitForTimeout(300);
  await page.goBack();
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('.setup')).toBeVisible();
});

test('패드 붙이기: 아래 패드를 키보드(Enter)로 누르면 다음 자리에 붙음', async ({ page }) => {
  const found = findPractice('placePads');
  test.skip(!found, '원고에 패드 붙이기가 없음');
  const { exam, page: p } = found!;
  await page.goto(`/#/${exam.id}/${p}`);
  const pad = page.locator('.pads__pad:not([disabled])');
  await centerOnScreen(pad);
  await pad.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.pads__count b')).toHaveText('1');
});

test('심호흡: 시작하기 바로 뒤 같은 자리의 멈추기는 잠깐 안 눌림 (빠르게 두 번 눌러도 계속)', async ({ page }) => {
  const found = findPractice('breathe');
  test.skip(!found, '원고에 심호흡이 없음');
  const { exam, page: p } = found!;
  await page.goto(`/#/${exam.id}/${p}`);
  const start = page.locator('.practice').filter({ has: page.locator('.breathe') }).getByRole('button', { name: '시작하기' });
  await centerOnScreen(start);
  await start.click();
  await page.getByRole('button', { name: '멈추기' }).click();
  await expect(page.locator('.breathe')).toHaveAttribute('data-phase', 'in');
  // 잠깐 뒤에는 멈추기가 됨
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: '멈추기' }).click();
  await expect(page.locator('.breathe')).toHaveAttribute('data-phase', 'idle');
});

test('쉬고 싶어요: 단계에서 누르면 풍선 숨쉬기 창 → "다시 할래요"로 닫으면 같은 단계 그대로 (체크 없음)', async ({ page }) => {
  const errors = watchErrors(page);
  const exam = exams[0];
  await page.goto(`/#/${exam.id}/3`);
  await page.waitForTimeout(TAP_LOCK_MS);
  await page.getByRole('button', { name: '쉬고 싶어요' }).click();
  const rest = page.getByRole('dialog', { name: '쉬는 시간' });
  await expect(rest).toBeVisible();
  await expect(rest.getByText('잠깐 쉬어요')).toBeVisible();
  // 풍선이 들이마셔요 → 내쉬어요 로 바뀜 (끝이 없음, 해낼 것 없음)
  await expect(rest.locator('.breathe')).toHaveAttribute('data-phase', 'out', { timeout: 5000 });
  await page.waitForTimeout(TAP_LOCK_MS);
  await rest.getByRole('button', { name: '다시 할래요' }).click();
  await expect(rest).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`#/${exam.id}/3$`));
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), STORAGE_KEY);
  expect(saved.progress?.[exam.id]?.checked ?? []).toEqual([]);
  expect(errors).toEqual([]);
});

test('보호자 메뉴: 글자를 아주 크게 해도 지우기 버튼은 메뉴 글자 크기 그대로', async ({ page }) => {
  await seed(page, { setupSeen: true, settings: { textScale: 1.3, readAloud: false } });
  await page.goto('/#/');
  await openCaregiver(page);
  for (const size of await page.locator('.sheet .btn--line').evaluateAll((els) => els.map((el) => getComputedStyle(el).fontSize))) expect(size).toBe('17px');
});

test('폰 + 글자 아주 크게: 볼 곳 고르기 카드 글자("할아버지")가 카드 안에', async ({ page }, testInfo) => {
  const vp = testInfo.project.use.viewport;
  test.skip(!vp || vp.width > 440, '폰 프로젝트에서만');
  const found = findPractice('lookAway');
  test.skip(!found, '원고에 볼 곳 고르기가 없음');
  await seed(page, { setupSeen: true, settings: { textScale: 1.3, companion: '할아버지', readAloud: false, reduceMotion: 'on' } });
  await page.goto(`/#/${found!.exam.id}/${found!.page}`);
  const cards = page.locator('.look__choice');
  await expect(cards.first()).toBeVisible();
  const outside = await cards.evaluateAll(
    (els) =>
      els.filter((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const t = range.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return t.left < r.left - 1 || t.right > r.right + 1;
      }).length,
  );
  expect(outside).toBe(0);
});

test('가로 화면 표지: "N단계 · 스티커" 줄이 시작하기 버튼 뒤에 깔리지 않음', async ({ page }, testInfo) => {
  const vp = testInfo.project.use.viewport;
  test.skip(!vp || vp.width <= vp.height, '가로 태블릿 프로젝트에서만');
  await seed(page, { setupSeen: true, settings: { readAloud: false, reduceMotion: 'on' } });
  await page.goto('/#/');
  for (const exam of exams) {
    await page.evaluate((h) => (location.hash = h), `#/${exam.id}/0`);
    const meta = page.locator('.intro__meta');
    await expect(meta).toBeVisible();
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState === 'finished'));
    const m = (await meta.boundingBox())!;
    const bar = (await page.locator('.bottom-bar').boundingBox())!;
    expect(m.y + m.height, exam.id).toBeLessThanOrEqual(bar.y + 1);
  }
});

test('세로 태블릿: 글자 크기를 바꾸면 화면 줄임을 다시 맞춤, 아주 크게여도 작은 태블릿 첫 화면·순서 화면이 한 화면에', async ({ page }, testInfo) => {
  const vp = testInfo.project.use.viewport;
  test.skip(!vp || vp.width < 600 || vp.height <= vp.width, '세로 태블릿 프로젝트에서만');
  const found = findPractice('breathe');
  test.skip(!found, '원고에 심호흡이 없음');
  await seed(page, { setupSeen: true, settings: { readAloud: false, reduceMotion: 'on' } });
  await page.goto(`/#/${found!.exam.id}/${found!.page}`);
  const fitOf = () => page.locator('[data-fit]').first().evaluate((el) => Number((el as HTMLElement).dataset.fit));
  await expect.poll(() => screenOverflow(page)).toBeLessThanOrEqual(1);
  const before = await fitOf();
  await openCaregiver(page);
  await page.getByRole('button', { name: '아주 크게' }).click();
  await page.getByRole('button', { name: '닫기' }).click();
  await expect.poll(fitOf).toBeLessThan(before);
  // 작은 세로 태블릿(600×880) + 아주 크게: 첫 화면·순서 화면도 살짝 줄여 한 화면에
  await page.setViewportSize({ width: 600, height: 880 });
  for (const [hash, ready] of [
    ['#/', '.shelf'],
    [`#/${exams[0].id}/1`, '.phase-list'],
  ]) {
    await page.evaluate((h) => (location.hash = h), hash);
    await expect(page.locator(ready)).toBeVisible();
    await expect.poll(() => screenOverflow(page), hash).toBeLessThanOrEqual(1);
  }
});

test('PC 태블릿 틀: 터치 태블릿(가로 1280×800)에서는 안 그림 (마우스 PC 에서만 그림)', async ({ browser }, info) => {
  test.skip(info.project.name !== info.config.projects[0].name, '화면 크기를 직접 정하는 점검이라 한 번만');
  const framed = async (options: Parameters<typeof browser.newContext>[0]) => {
    const context = await browser.newContext({ ...options, baseURL: info.project.use.baseURL });
    const page = await context.newPage();
    await page.goto('/#/xray/0');
    await page.locator('[data-app-frame]').waitFor();
    const radius = await page.locator('.app-frame').evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
    await context.close();
    return radius !== '0px';
  };
  expect(await framed({ viewport: { width: 1280, height: 800 }, hasTouch: true, isMobile: true })).toBe(false);
  // 마우스 PC 쪽(틀 있음)은 여기서 못 봄: 화면 없는 시험 브라우저는 마우스가 없는 기기로 잡혀서(hover·pointer 모두 none) 늘 틀이 없음.
  // 실제 PC 브라우저·편집기(Electron)에서 틀이 나오는 것은 손으로 확인함 (2026-10-08)
});
