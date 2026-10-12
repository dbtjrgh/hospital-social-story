// 편집기 화면 (Electron 앱 안에서만, CLAUDE.md 1-c ③단계)
//   위: 도구 막대 (편집 ↔ 미리보기, 되돌리기·다시 하기, 빠진 것, 웹으로 내보내기(⑤단계), 저장 상태·저장)
//   왼쪽: 페이지 목록 (누르면 그 페이지로)   가운데: 플레이어 그대로   오른쪽: 이 페이지의 사진·소리 + 효과음
//   사진은 가운데 화면의 사진 위에서도 바꿈 (PhotoEdit). 누구나 쓰게: 쉬운 말, 끌어다 놓기, 되돌리기
//   양옆 칸 너비는 가장자리 손잡이를 끌어서 바꿈 (PanelResizer)
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { catalog, getExam, hospital } from '../content';
import { asset, isVideo } from '../lib/asset';
import { navigate, toHash, useRoute, type Route } from '../lib/router';
import { effectFile } from '../lib/sound';
import { removeEffect, removeSense, removeVoice, replaceMedia, resetPhoto, setEffect, setSense, setVoice } from './actions';
import { CheckDialog } from './CheckDialog';
import { DEVICES, restartPreview, setCheckOpen, setDevice, setExportOpen, setMode, useEditor } from './editorState';
import { ExportDialog } from './ExportDialog';
import { ExamListSettings, StepSettings, TextPanel } from './PagePanel';
import { PanelResizer } from './PanelResizer';
import { textIssues } from './texts';
import { AUDIO_ACCEPT, IMAGE_ACCEPT, MEDIA_ACCEPT, pickFile } from './media';
import { effectSlots, missingSlots, pageLabel, pageSlots, type EffectSlot, type PhotoSlot, type SenseSlot, type Slot, type VoiceSlot } from './slots';
import './editor.css';

export function EditorShell({ children }: { children: ReactNode }) {
  const { mode, busy } = useEditor();
  const route = useRoute();
  return (
    <>
      <Toolbar route={route} />
      {mode === 'edit' && <PageList route={route} />}
      {mode === 'edit' && <PanelResizer side="left" />}
      {children}
      {mode === 'edit' && <SlotPanel route={route} />}
      {mode === 'edit' && <PanelResizer side="right" />}
      {busy && (
        <div className="ed-busy" role="status">
          바꾸는 중…
        </div>
      )}
    </>
  );
}

// ───────── 도구 막대 ─────────

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function Toolbar({ route }: { route: Route }) {
  const { mode, edit, notice, device, scale, exportOpen, check, checkOpen } = useEditor();
  const checking = check?.kind === 'done' && !!check.result.url;
  const [missingOpen, setMissingOpen] = useState(false);
  const missing = missingSlots();
  const issues = textIssues(pageLabel);
  const missingCount = missing.photos.length + missing.temps.length + missing.voices.length + missing.senses.length + missing.effects.length + issues.length;

  let status = '';
  if (edit) {
    if (!edit.hasFile) status = '새 프로젝트 · 아직 저장 안 함';
    else if (edit.dirty) status = '저장 안 한 내용이 있어요';
    else if (edit.savedAt) status = `${edit.autoSaved ? '자동 저장됨' : '저장됨'} ${hhmm(edit.savedAt)}`;
  }

  return (
    <header className="ed-toolbar">
      <div className="ed-toolbar__title">
        <strong>{hospital.name}</strong>
        <span className="ed-muted">{status}</span>
      </div>
      <div className="ed-seg" role="group" aria-label="모드">
        <button type="button" aria-pressed={mode === 'edit'} onClick={() => setMode('edit')} title="편집 모드 (Ctrl+E)">
          편집
        </button>
        <button type="button" aria-pressed={mode === 'preview'} onClick={() => setMode('preview')} title="미리보기 (F5)">
          미리보기
        </button>
      </div>
      {mode === 'preview' && (
        <div className="ed-preview-ctl">
          <div className="ed-seg ed-seg--small" role="group" aria-label="미리보기 기기 크기">
            {DEVICES.map((d) => (
              <button
                key={d.id}
                type="button"
                aria-pressed={device === d.id}
                onClick={() => setDevice(d.id)}
                title={d.w ? `${d.label} ${d.w}×${d.h}` : '가운데 영역 전체'}
              >
                {d.label}
              </button>
            ))}
          </div>
          {scale < 0.999 && <span className="ed-muted">{Math.round(scale * 100)}%로 보는 중</span>}
          <button type="button" className="ed-btn" onClick={restartPreview} title="처음 쓰는 사람처럼 첫 화면(처음 셋업 창)부터">
            ↺ 처음부터 보기
          </button>
        </div>
      )}
      <div className="ed-toolbar__actions">
        <button
          type="button"
          className="ed-btn"
          disabled={!edit?.canUndo}
          onClick={() => void window.ssApp?.undo()}
          title={edit?.undoLabel ? `되돌리기: ${edit.undoLabel} (Ctrl+Z)` : '되돌리기 (Ctrl+Z)'}
        >
          ↶ 되돌리기
        </button>
        <button
          type="button"
          className="ed-btn"
          disabled={!edit?.canRedo}
          onClick={() => void window.ssApp?.redo()}
          title={edit?.redoLabel ? `다시 하기: ${edit.redoLabel} (Ctrl+Y)` : '다시 하기 (Ctrl+Y)'}
        >
          ↷ 다시 하기
        </button>
        <div className="ed-missing">
          <button type="button" className="ed-btn" aria-expanded={missingOpen} onClick={() => setMissingOpen((o) => !o)}>
            빠진 것 <span className="ed-count">{missingCount}</span>
          </button>
          {missingOpen && <MissingPanel route={route} onClose={() => setMissingOpen(false)} />}
        </div>
        {/* 내보낸 zip 을 잠깐 웹서버로 열어 둔 동안 (CheckDialog) */}
        {checking && !checkOpen && (
          <button type="button" className="ed-btn ed-btn--live" onClick={() => setCheckOpen(true)} title="내보낸 zip 확인 결과·서버 끄기">
            <span className="ed-live-dot" aria-hidden="true" /> 웹 확인 중
          </button>
        )}
        <button type="button" className="ed-btn" onClick={() => setExportOpen(true)} title="웹 결과물 zip 만들기 (Ctrl+B)">
          웹으로 내보내기
        </button>
        <button type="button" className="ed-btn ed-btn--primary" onClick={() => void window.ssApp?.save()} title="저장 (Ctrl+S)">
          저장
        </button>
      </div>
      {exportOpen && (
        <ExportDialog
          onClose={() => setExportOpen(false)}
          onShowMissing={() => {
            setExportOpen(false);
            setMissingOpen(true);
          }}
        />
      )}
      {checkOpen && <CheckDialog />}
      {notice && (
        <p className="ed-notice" role="alert">
          {notice}
        </p>
      )}
    </header>
  );
}

// ───────── 빠진 것 목록 ─────────

function MissingPanel({ route, onClose }: { route: Route; onClose: () => void }) {
  const m = missingSlots();
  const issues = textIssues(pageLabel);
  const go = (to: Route) => {
    setMode('edit');
    navigate(to);
    onClose();
  };
  const group = (title: string, hint: string, items: (PhotoSlot | VoiceSlot | SenseSlot)[]) =>
    items.length > 0 && (
      <section>
        <h3>
          {title} <span className="ed-count">{items.length}</span>
        </h3>
        <p className="ed-muted">{hint}</p>
        <ul>
          {items.map((s) => (
            <li key={`${s.kind}-${s.label}`}>
              <button type="button" className={toHash(s.route) === toHash(route) ? 'is-here' : ''} onClick={() => go(s.route)}>
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  return (
    <div className="ed-pop" role="dialog" aria-label="빠진 것">
      <div className="ed-pop__head">
        <strong>빠진 것</strong>
        <button type="button" className="ed-btn" onClick={onClose}>
          닫기
        </button>
      </div>
      {issues.length > 0 && (
        <section>
          <h3>
            고칠 문장 <span className="ed-count ed-count--warn">{issues.length}</span>
          </h3>
          <p className="ed-muted">쓰면 안 되는 표현("안 아파요" 같은 거짓 약속 등)이나 형광펜 ** 짝이 안 맞는 문장이에요</p>
          <ul>
            {issues.map((s) => (
              <li key={s.label}>
                <button type="button" className={toHash(s.route) === toHash(route) ? 'is-here' : ''} onClick={() => go(s.route)}>
                  {s.label}
                  <span className="ed-muted"> — {s.problems.join(', ')}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {group('사진 없음', '이 자리에는 "사진 준비 중"이 보여요', m.photos)}
      {group('임시 사진', '시안에서 자른 사진이에요. 병원 사진으로 바꿔 주세요', m.temps)}
      {group('읽기 음성 없음', '음성이 없으면 태블릿의 기계 목소리로 읽어요', m.voices)}
      {group('미리 알아 두기 소리 없음', '누르면 소리 없이 버튼만 움직여요', m.senses)}
      {m.effects.length > 0 && (
        <section>
          <h3>
            효과음 없음 <span className="ed-count">{m.effects.length}</span>
          </h3>
          <p className="ed-muted">오른쪽 "효과음"에서 넣어요: {m.effects.map((e) => e.label).join(', ')}</p>
        </section>
      )}
    </div>
  );
}

// ───────── 왼쪽: 페이지 목록 ─────────

function PageList({ route }: { route: Route }) {
  const here = toHash(route);
  const listRef = useRef<HTMLElement>(null);
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
  }, [here]);
  const item = (to: Route, label: string, mark?: 'missing' | 'temp' | 'ok') => (
    <li key={toHash(to)}>
      <button type="button" aria-current={toHash(to) === here ? 'page' : undefined} onClick={() => navigate(to)}>
        {mark && <span className={`ed-dot ed-dot--${mark}`} aria-hidden="true" />}
        <span>{label}</span>
      </button>
    </li>
  );
  return (
    <nav className="ed-left" ref={listRef} aria-label="페이지 목록">
      <ul>{item({ name: 'home' }, '첫 화면')}</ul>
      {catalog.map((c) => {
        const exam = getExam(c.id);
        if (!exam) return null;
        const r = (page: number): Route => ({ name: 'exam', examId: exam.id, page });
        return (
          <section key={exam.id}>
            <h3>{exam.title}</h3>
            <ul>
              {item(r(0), '표지')}
              {item(r(1), '순서 알아보기')}
              {exam.steps.map((step, i) => {
                const photo = pageSlots(r(i + 2)).find((s): s is PhotoSlot => s.kind === 'photo');
                const mark = !photo || photo.status === 'missing' ? 'missing' : photo.status === 'temp' ? 'temp' : 'ok';
                return item(r(i + 2), `${i + 1}. ${step.text.replace(/\*\*/g, '').replace(/\{companion(:[^}]*)?\}/g, '○○')}`, mark);
              })}
              {item(r(exam.steps.length + 2), '스티커판')}
            </ul>
          </section>
        );
      })}
      <p className="ed-legend ed-muted">
        <span className="ed-dot ed-dot--ok" /> 사진 있음 <span className="ed-dot ed-dot--temp" /> 임시 사진 <span className="ed-dot ed-dot--missing" /> 사진 없음
      </p>
    </nav>
  );
}

// ───────── 오른쪽: 이 페이지의 사진·소리 ─────────

let playing: HTMLAudioElement | null = null;
function listen(path: string) {
  playing?.pause();
  playing = new Audio(asset(path));
  void playing.play().catch(() => undefined);
}

/** 파일을 끌어다 놓을 수 있는 칸 */
function DropRow({ accept, onFile, children }: { accept: 'image' | 'audio'; onFile: (f: File) => void; children: ReactNode }) {
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };
  return (
    <li
      className={`ed-slot${over ? ' is-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      data-accept={accept}
    >
      {children}
    </li>
  );
}

function PhotoRow({ slot }: { slot: PhotoSlot }) {
  const video = isVideo(slot.path) && slot.status !== 'missing';
  const pick = async () => {
    const f = await pickFile(slot.field ? MEDIA_ACCEPT : IMAGE_ACCEPT);
    if (f) void replaceMedia(slot, f);
  };
  const statusText = slot.status === 'missing' ? '사진 없음' : slot.status === 'temp' ? '임시 사진' : video ? '영상 있음' : '사진 있음';
  return (
    <DropRow accept="image" onFile={(f) => void replaceMedia(slot, f)}>
      <div className="ed-thumb">
        {slot.status === 'missing' ? <span>없음</span> : video ? <video src={asset(slot.path)} muted preload="metadata" /> : <img src={asset(slot.path)} alt="" />}
      </div>
      <div className="ed-slot__body">
        <strong>{slot.label}</strong>
        <span className={`ed-status ed-status--${slot.status}`}>{statusText}</span>
        <div className="ed-slot__btns">
          <button type="button" className="ed-btn" onClick={() => void pick()}>
            {slot.status === 'missing' ? '사진 넣기' : '바꾸기'}
          </button>
          <button type="button" className="ed-btn ed-btn--quiet" onClick={() => void resetPhoto(slot)} title="새 프로젝트의 기본 사진으로 되돌려요">
            기본 사진으로
          </button>
        </div>
        <small className="ed-muted">{slot.field ? '사진이나 영상(MP4)을 여기로 끌어다 놓아도 돼요' : '사진을 여기로 끌어다 놓아도 돼요'}</small>
      </div>
    </DropRow>
  );
}

function SoundRow({
  title,
  ready,
  hint,
  playPath,
  onFile,
  onRemove,
}: {
  title: string;
  ready: boolean;
  hint: string;
  playPath?: string;
  onFile: (f: File) => void;
  onRemove?: () => void;
}) {
  const pick = async () => {
    const f = await pickFile(AUDIO_ACCEPT);
    if (f) onFile(f);
  };
  return (
    <DropRow accept="audio" onFile={onFile}>
      <div className="ed-slot__body">
        <strong>{title}</strong>
        <span className={`ed-status ed-status--${ready ? 'ready' : 'missing'}`}>{ready ? '소리 있음' : hint}</span>
        <div className="ed-slot__btns">
          {ready && playPath && (
            <button type="button" className="ed-btn" onClick={() => listen(playPath)}>
              ▶ 듣기
            </button>
          )}
          <button type="button" className="ed-btn" onClick={() => void pick()}>
            {ready ? '소리 바꾸기' : '소리 넣기'}
          </button>
          {ready && onRemove && (
            <button type="button" className="ed-btn ed-btn--quiet" onClick={onRemove}>
              빼기
            </button>
          )}
        </div>
      </div>
    </DropRow>
  );
}

function SlotRow({ slot }: { slot: Slot }) {
  if (slot.kind === 'photo') return <PhotoRow slot={slot} />;
  if (slot.kind === 'voice') {
    return (
      <SoundRow
        title="읽기 음성"
        ready={slot.ready}
        hint="없음 — 기계 목소리로 읽어요"
        playPath={slot.path}
        onFile={(f) => void setVoice(slot, f)}
        onRemove={() => void removeVoice(slot)}
      />
    );
  }
  if (slot.kind === 'sense') {
    const own = !!slot.path && slot.ready;
    return (
      <SoundRow
        title={`미리 알아 두기 · ${slot.text}`}
        ready={slot.ready}
        hint="없음 — 버튼만 움직여요"
        playPath={own ? slot.path : slot.synth ? effectFile(slot.synth) : undefined}
        onFile={(f) => void setSense(slot, f)}
        onRemove={own ? () => void removeSense(slot) : undefined}
      />
    );
  }
  return <EffectRow slot={slot} />;
}

function EffectRow({ slot }: { slot: EffectSlot }) {
  return (
    <SoundRow
      title={slot.label}
      ready={slot.ready}
      hint="없음"
      playPath={effectFile(slot.id)}
      onFile={(f) => void setEffect(slot, f)}
      onRemove={() => void removeEffect(slot)}
    />
  );
}

function SlotPanel({ route }: { route: Route }) {
  const slots = pageSlots(route);
  const page = pageLabel(route);
  const exam = route.name === 'exam' ? getExam(route.examId) : undefined;
  const stepIndex = route.name === 'exam' ? route.page - 2 : -1;
  const isStep = !!exam && stepIndex >= 0 && stepIndex < exam.steps.length;
  return (
    // 페이지가 바뀌면 칸을 새로 (고치던 글이 다른 페이지 칸에 남지 않게)
    <aside key={toHash(route)} className="ed-right" aria-label="이 페이지 고치기">
      <h2>{page}</h2>
      {route.name === 'home' && <ExamListSettings />}
      <TextPanel route={route} page={page} />
      {isStep && <StepSettings exam={exam} index={stepIndex} />}
      <h3 className="ed-sec__title">사진·소리</h3>
      {slots.length === 0 ? (
        <p className="ed-muted">이 페이지에는 바꿀 사진·소리가 없어요.</p>
      ) : (
        <ul className="ed-slots">
          {slots.map((s) => (
            <SlotRow key={`${s.kind}-${s.label}`} slot={s} />
          ))}
        </ul>
      )}
      <details className="ed-effects">
        <summary>효과음 (모든 페이지 공통)</summary>
        <ul className="ed-slots">
          {effectSlots().map((s) => (
            <EffectRow key={s.id} slot={s} />
          ))}
        </ul>
      </details>
    </aside>
  );
}
