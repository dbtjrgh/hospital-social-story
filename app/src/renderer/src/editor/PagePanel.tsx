// 편집 모드 오른쪽 칸의 "글"과 "설정" (CLAUDE.md 1-c ⑥단계)
//   글: 페이지마다 고칠 수 있는 문장 (texts.ts). 칸을 떠나면(또는 Enter) 고침, Esc = 원래대로. 문장 점검은 원고 검사기와 같은 규칙
//   단계 설정: 순서(위·아래)·새 단계·빼기·묶음(스티커)·바늘·피 사진·연습 숫자
//   첫 화면: 검사 보이기·순서
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { catalog, getExam, hospital } from '../content';
import { project } from '../content/project';
import { PRACTICE_LIMITS } from '../content/rules';
import type { ExamContent } from '../content/types';
import { PRACTICE_NAME } from '../components/StepPicker';
import { fillTokens } from '../lib/josa';
import type { Route } from '../lib/router';
import { useSettings } from '../lib/store';
import {
  insertStepAction,
  moveStepAction,
  removeStepAction,
  setExamList,
  setPracticeNumber,
  setSensitive,
  setStepPhaseAction,
  setText,
} from './actions';
import { registerFlush, takeFocus } from './editorState';
import { moveExam, moveKind, setExamOn, type MoveKind } from './structure';
import { fieldProblems, fieldText, pageTexts, type TextField } from './texts';

/** 호칭 넣기 (원고 토큰 — lib/josa.ts fillTokens). 이름은 지금 보호자 설정의 호칭으로 보여 줌 */
const COMPANION_TOKENS = ['{companion}', '{companion:와}', '{companion:가}', '{companion:는}', '{companion:를}'];

/** 원고 글 → 화면에 보이는 모양 (호칭·형광펜) */
function Preview({ text, companion }: { text: string; companion: string }) {
  const parts = fillTokens(text, { companion }).split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="ed-preview">
      <span className="ed-muted">화면에서는 </span>
      {parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <mark key={i}>{p.slice(2, -2)}</mark> : <span key={i}>{p}</span>))}
    </p>
  );
}

function TextFieldRow({ field, page }: { field: TextField; page: string }) {
  const initial = fieldText(field);
  const [text, setTextState] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  /** 보낸 글 (같은 글을 두 번 보내지 않게) · 보내는 중인 일 */
  const sent = useRef<string | null>(null);
  const inflight = useRef<Promise<unknown> | null>(null);
  const cancelBlur = useRef(false);
  const { companion } = useSettings();
  const id = `ed-f-${field.key}`;

  // 원고가 바뀌면(되돌리기·다른 칸이 같은 원고를 고침) 칸도 그 글로
  useEffect(() => {
    setTextState(initial);
    sent.current = null;
  }, [initial]);

  // 화면을 다시 띄운 뒤 이 칸으로 넘어가던 중이었으면 커서를 둠
  useEffect(() => {
    if (!takeFocus(field.key)) return;
    const el = ref.current;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, [field.key]);

  const commit = (focusNext?: string): Promise<unknown> => {
    if (text === initial || text === sent.current) return inflight.current ?? Promise.resolve();
    sent.current = text;
    inflight.current = setText(field, text, page, focusNext).then((ok) => {
      if (!ok) {
        sent.current = null;
        setTextState(initial);
      }
    });
    return inflight.current;
  };

  // 친 채 저장·내보내기·닫기를 하면 앱이 먼저 이 글을 받아 감
  useEffect(() => {
    if (text === initial) return;
    return registerFlush(() => commit());
  });

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelBlur.current = true;
      setTextState(initial);
      ref.current?.blur();
    } else if (e.key === 'Enter' && (e.ctrlKey || !field.multiline) && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      ref.current?.blur();
    }
  };

  /** 커서 자리에 넣기 (고른 글이 있으면 감쌈) */
  const insert = (before: string, after = '') => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: t, value } = el;
    const next = value.slice(0, s) + before + value.slice(s, t) + after + value.slice(t);
    setTextState(next);
    requestAnimationFrame(() => {
      el.focus();
      const at = t + before.length + after.length;
      el.setSelectionRange(after ? s + before.length : at, after ? t + before.length : at);
    });
  };

  const problems = fieldProblems(field, text);
  const showPreview = (field.companion && text.includes('{')) || (field.marks && text.includes('**'));
  const lines = Math.max(field.multiline ? 2 : 1, Math.min(6, text.split('\n').length + (text.length > 34 ? Math.floor(text.length / 34) : 0)));

  return (
    <div className={`ed-field${problems.length ? ' has-problem' : ''}`}>
      <label htmlFor={id}>
        {field.label}
        {field.required && <span className="ed-muted"> · 꼭</span>}
      </label>
      <textarea
        id={id}
        ref={ref}
        data-ed-key={field.key}
        rows={lines}
        value={text}
        spellCheck={false}
        onChange={(e) => setTextState(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={(e) => {
          if (cancelBlur.current) {
            cancelBlur.current = false;
            return;
          }
          // 바로 다음 글 칸으로 넘어가면, 화면을 다시 띄워도 그 칸에 커서를 되살림
          void commit((e.relatedTarget as HTMLElement | null)?.dataset.edKey);
        }}
      />
      {(field.marks || field.companion) && (
        <div className="ed-field__tools">
          {field.marks && (
            <button type="button" className="ed-btn ed-btn--small" onMouseDown={(e) => e.preventDefault()} onClick={() => insert('**', '**')} title="강조할 낱말을 고르고 누르세요 (형광펜이 그어져요)">
              형광펜
            </button>
          )}
          {field.companion && (
            <select
              className="ed-select ed-select--small"
              value=""
              aria-label="함께 가는 사람 호칭 넣기"
              onChange={(e) => {
                if (e.target.value) insert(e.target.value);
              }}
            >
              <option value="">호칭 넣기…</option>
              {COMPANION_TOKENS.map((t) => (
                <option key={t} value={t}>
                  {fillTokens(t, { companion })}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {showPreview && <Preview text={text} companion={companion} />}
      {problems.map((p) => (
        <p key={p} className="ed-field__problem" role="status">
          {p}
        </p>
      ))}
      {field.voiced && text !== initial && <p className="ed-field__note">읽기 음성이 따로 있어요. 문장을 바꾸면 음성도 새로 넣어 주세요.</p>}
      {field.hint && <p className="ed-muted ed-field__hint">{field.hint}</p>}
    </div>
  );
}

/** 이 페이지의 글 칸 */
export function TextPanel({ route, page }: { route: Route; page: string }) {
  const groups = pageTexts(route);
  if (groups.length === 0) return null;
  return (
    <section className="ed-sec">
      {groups.map((g) => (
        <div key={g.title} className="ed-group">
          <h3>{g.title}</h3>
          {g.fields.map((f) => (
            // 원고 자리가 키 → 단계를 옮겨도 다른 단계의 칸과 섞이지 않음
            <TextFieldRow key={`${f.file}#${f.pointer}`} field={f} page={page} />
          ))}
        </div>
      ))}
      <p className="ed-muted ed-sec__foot">칸을 떠나거나 Enter 를 누르면 바뀌어요. Esc = 원래대로, 되돌리기 Ctrl+Z</p>
    </section>
  );
}

// ───────── 단계 설정 ─────────

function moveText(exam: ExamContent, index: number, dir: -1 | 1, kind: MoveKind | null): string {
  if (!kind) return '';
  const neighbor = exam.phases.find((p) => p.id === exam.steps[index + dir]?.phase)?.title ?? '';
  const mine = exam.phases.find((p) => p.id === exam.steps[index].phase)?.title ?? '';
  if (kind === 'swap') return dir < 0 ? '앞 단계와 자리를 바꿔요' : '뒤 단계와 자리를 바꿔요';
  if (kind === 'join') return `${dir < 0 ? '앞' : '뒤'} 묶음 "${neighbor}"에 들어가요`;
  return `묶음 "${mine}"째 "${neighbor}" ${dir < 0 ? '앞으로' : '뒤로'} 가요`;
}

function NumberRow({ label, unit, value, limit, onSet }: { label: string; unit: string; value: number; limit: { min: number; max: number }; onSet: (n: number) => void }) {
  return (
    <div className="ed-num">
      <span>{label}</span>
      <button type="button" className="ed-btn ed-btn--small" disabled={value <= limit.min} onClick={() => onSet(value - 1)} aria-label={`${label} 줄이기`}>
        −
      </button>
      <strong>
        {value}
        {unit}
      </strong>
      <button type="button" className="ed-btn ed-btn--small" disabled={value >= limit.max} onClick={() => onSet(value + 1)} aria-label={`${label} 늘리기`}>
        +
      </button>
      <span className="ed-muted">
        ({limit.min}~{limit.max}
        {unit})
      </span>
    </div>
  );
}

export function StepSettings({ exam, index }: { exam: ExamContent; index: number }) {
  const step = exam.steps[index];
  const up = moveKind(exam, index, -1);
  const down = moveKind(exam, index, 1);
  const sole = exam.steps.filter((s) => s.phase === step.phase).length === 1;
  const p = step.practice;
  const remove = () => {
    const name = step.text.replace(/\*\*/g, '').replace(/\{companion(:[^}]*)?\}/g, '○○');
    const extra = sole ? `\n이 묶음("${exam.phases.find((ph) => ph.id === step.phase)?.title}")에 이 단계뿐이라 스티커도 하나 줄어요.` : '';
    if (window.confirm(`${index + 1}단계 "${name}"를 뺄까요?${extra}\n되돌리기(Ctrl+Z)로 되살릴 수 있어요.`)) removeStepAction(exam, index);
  };
  return (
    <section className="ed-sec">
      <div className="ed-group">
        <h3>단계</h3>
        <div className="ed-row">
          <button type="button" className="ed-btn" disabled={!up} onClick={() => moveStepAction(exam, index, -1)} title={moveText(exam, index, -1, up)}>
            ▲ 위로
          </button>
          <button type="button" className="ed-btn" disabled={!down} onClick={() => moveStepAction(exam, index, 1)} title={moveText(exam, index, 1, down)}>
            ▼ 아래로
          </button>
        </div>
        {/* 묶음이 바뀌는 옮기기는 미리 알려 줌 (스티커가 달라지므로) */}
        {up && up !== 'swap' && <p className="ed-muted ed-field__hint">▲ {moveText(exam, index, -1, up)}</p>}
        {down && down !== 'swap' && <p className="ed-muted ed-field__hint">▼ {moveText(exam, index, 1, down)}</p>}
        <div className="ed-row">
          <button type="button" className="ed-btn" onClick={() => insertStepAction(exam, index)}>
            ＋ 뒤에 새 단계
          </button>
          <button type="button" className="ed-btn ed-btn--danger" disabled={exam.steps.length <= 1} onClick={remove}>
            이 단계 빼기
          </button>
        </div>
        <label className="ed-field">
          <span>묶음 (스티커)</span>
          <select className="ed-select" value={step.phase} disabled={sole} onChange={(e) => setStepPhaseAction(exam, index, e.target.value)}>
            {exam.phases.map((ph, i) => (
              <option key={ph.id} value={ph.id}>
                {i + 1}. {ph.title}
              </option>
            ))}
          </select>
          <span className="ed-muted ed-field__hint">
            {sole ? '이 묶음에는 이 단계뿐이에요. 위·아래 버튼으로 묶음째 옮길 수 있어요' : '묶음의 단계를 모두 하면 스티커를 받아요'}
          </span>
        </label>
        <label className="ed-check">
          <input type="checkbox" checked={!!step.sensitive} onChange={(e) => setSensitive(exam, index, e.target.checked)} />
          <span>
            바늘·피가 보일 수 있는 사진
            <span className="ed-muted ed-field__hint">보호자가 "바늘·피 사진 가리기"를 고르면 이 사진을 가려요</span>
          </span>
        </label>
      </div>
      {p && (
        <div className="ed-group">
          <h3>연습 · {PRACTICE_NAME[p.type]}</h3>
          {(p.type === 'hold' || p.type === 'lookAway') && (
            <NumberRow label={p.type === 'hold' ? '가만히 있는 시간' : '보며 세는 시간'} unit="초" value={p.seconds} limit={PRACTICE_LIMITS.seconds} onSet={(n) => setPracticeNumber(exam, index, 'seconds', n)} />
          )}
          {p.type === 'breathe' && <NumberRow label="숨 쉬는 횟수" unit="번" value={p.count} limit={PRACTICE_LIMITS.count} onSet={(n) => setPracticeNumber(exam, index, 'count', n)} />}
          {p.type !== 'hold' && p.type !== 'lookAway' && p.type !== 'breathe' && <p className="ed-muted">이 연습은 바꿀 숫자가 없어요.</p>}
        </div>
      )}
    </section>
  );
}

// ───────── 첫 화면: 검사 보이기·순서 ─────────

export function ExamListSettings() {
  const list = hospital.exams;
  // 원고가 있는 검사 전부 + 목록에만 있는 검사(원고 없음 → "준비 중" 카드)
  const all = [...list, ...project().exams.map((e) => e.id).filter((id) => !list.includes(id))];
  const title = (id: string) => catalog.find((c) => c.id === id)?.title ?? project().exams.find((e) => e.id === id)?.title ?? id;
  const toggle = (id: string, on: boolean) => {
    try {
      setExamList(setExamOn(list, id, on), `검사 ${on ? '보이기' : '숨기기'} · ${title(id)}`);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <section className="ed-sec">
      <div className="ed-group">
        <h3>검사 (첫 화면 카드)</h3>
        <ul className="ed-exams">
          {all.map((id) => {
            const on = list.includes(id);
            const i = list.indexOf(id);
            return (
              <li key={id} className={on ? '' : 'is-off'}>
                <label className="ed-check">
                  <input type="checkbox" checked={on} onChange={(e) => toggle(id, e.target.checked)} />
                  <span>
                    {title(id)}
                    {!getExam(id) && on && <span className="ed-muted"> · 원고 없음 (준비 중)</span>}
                  </span>
                </label>
                {on && (
                  <span className="ed-row ed-row--tight">
                    <button type="button" className="ed-btn ed-btn--small" disabled={i === 0} onClick={() => setExamList(moveExam(list, id, -1), `검사 순서 · ${title(id)} 위로`)} aria-label={`${title(id)} 위로`}>
                      ▲
                    </button>
                    <button
                      type="button"
                      className="ed-btn ed-btn--small"
                      disabled={i === list.length - 1}
                      onClick={() => setExamList(moveExam(list, id, 1), `검사 순서 · ${title(id)} 아래로`)}
                      aria-label={`${title(id)} 아래로`}
                    >
                      ▼
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="ed-muted ed-field__hint">끄면 첫 화면·페이지 목록·웹 결과물에서 빠져요. 원고는 남아서 다시 켜면 그대로예요</p>
      </div>
    </section>
  );
}
