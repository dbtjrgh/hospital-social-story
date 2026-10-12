// 웹으로 내보내기 창 (CLAUDE.md 1-c ⑤단계) — 도구 막대 "웹으로 내보내기" · 메뉴 파일 → 웹으로 내보내기 (Ctrl+B)
//   1. 빠진 것을 먼저 보여 줌 (고칠 문장·사진 없음·임시 사진·음성 없음…) → 그래도 내보낼 수 있음 (빠진 자리는 웹에서도 "사진 준비 중"·기계 목소리)
//   2. "내보내기…" → 앱이 저장 대화창을 띄우고 zip 하나를 만듦 (src/main/exportWeb.ts)
//   3. 다 되면 파일 이름·크기 + "폴더에서 보기"
// 저장하지 않은 편집도 지금 화면 그대로 들어감
import { useEffect, useRef, useState } from 'react';
import { startCheck } from './editorState';
import { missingSlots, pageLabel } from './slots';
import { textIssues } from './texts';

type Phase = { kind: 'ask' } | { kind: 'working' } | { kind: 'done'; file: string; bytes: number; count: number } | { kind: 'error'; message: string };

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function size(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export function ExportDialog({ onClose, onShowMissing }: { onClose: () => void; onShowMissing: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'ask' });
  const mainRef = useRef<HTMLButtonElement>(null);
  const m = missingSlots();
  // 문장 점검 (원고 검사기와 같은 규칙 — content/rules.ts): 쓰면 안 되는 표현·형광펜 짝·빈 칸
  const issues = textIssues(pageLabel).length;
  const rows = [
    { n: issues, label: '고칠 문장', hint: '쓰면 안 되는 표현이나 형광펜 ** 짝이 안 맞는 글이 그대로 보여요' },
    { n: m.photos.length, label: '사진 없음', hint: '"사진 준비 중"으로 보여요' },
    { n: m.temps.length, label: '임시 사진', hint: '시안에서 자른 사진에 "임시 사진" 표시가 보여요' },
    { n: m.voices.length, label: '읽기 음성 없음', hint: '태블릿·브라우저의 기계 목소리로 읽어요' },
    { n: m.senses.length, label: '미리 알아 두기 소리 없음', hint: '누르면 소리 없이 버튼만 움직여요' },
    { n: m.effects.length, label: '효과음 없음', hint: '그 소리가 나지 않아요' },
  ].filter((r) => r.n > 0);

  const working = phase.kind === 'working';
  useEffect(() => {
    mainRef.current?.focus();
  }, [phase.kind]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !working) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [working, onClose]);

  const run = async () => {
    if (!window.ssApp) return;
    setPhase({ kind: 'working' });
    const res = await window.ssApp.exportWeb();
    if (res.ok) setPhase({ kind: 'done', file: res.file, bytes: res.bytes, count: res.count });
    else if (res.canceled) setPhase({ kind: 'ask' });
    else setPhase({ kind: 'error', message: res.message ?? '알 수 없는 오류' });
  };

  return (
    <div
      className="ed-modal"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !working) onClose();
      }}
    >
      <div className="ed-modal__box" role="dialog" aria-modal="true" aria-labelledby="ed-export-title">
        <h2 id="ed-export-title">웹으로 내보내기</h2>

        {phase.kind === 'ask' && (
          <>
            <p>
              지금 미리보기와 똑같은 웹 결과물을 <strong>zip 파일 하나</strong>로 만들어요. 서버의 아무 폴더에나 풀면 그 안의 <code>index.html</code>로 열려요.
            </p>
            {rows.length === 0 ? (
              <p className="ed-modal__ok">빠진 것이 없어요.</p>
            ) : (
              <>
                <p className="ed-muted">아직 빠진 것이 있어요. 그대로 내보내도 되지만, 이 자리는 웹에서도 이렇게 보여요.</p>
                <ul className="ed-modal__list">
                  {rows.map((r) => (
                    <li key={r.label}>
                      <strong>{r.label}</strong> <span className="ed-count">{r.n}</span>
                      <span className="ed-muted"> — {r.hint}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="ed-modal__actions">
              {rows.length > 0 && (
                <button type="button" className="ed-btn ed-btn--quiet" onClick={onShowMissing}>
                  빠진 것 보기
                </button>
              )}
              <button type="button" className="ed-btn" onClick={onClose}>
                취소
              </button>
              <button type="button" className="ed-btn ed-btn--primary" ref={mainRef} onClick={() => void run()}>
                내보내기…
              </button>
            </div>
          </>
        )}

        {working && (
          <p role="status" className="ed-modal__working">
            만드는 중이에요…
          </p>
        )}

        {phase.kind === 'done' && (
          <>
            <p className="ed-modal__ok">다 만들었어요.</p>
            <p>
              <strong>{fileName(phase.file)}</strong>
              <span className="ed-muted">
                {' '}
                · {size(phase.bytes)} · 파일 {phase.count}개
              </span>
            </p>
            <p className="ed-muted">이 zip 을 서버 담당자에게 보내 주세요. 압축을 풀어 그 안의 index.html 을 웹 주소로 열면 돼요. (파일을 더블클릭해서는 안 열려요)</p>
            <p className="ed-muted">보내기 전에 "브라우저에서 확인"으로 서버에 올린 것처럼 열어 볼 수 있어요.</p>
            <div className="ed-modal__actions">
              <button type="button" className="ed-btn" onClick={() => void window.ssApp?.showExport()}>
                폴더에서 보기
              </button>
              <button type="button" className="ed-btn" onClick={() => void startCheck(true)}>
                브라우저에서 확인
              </button>
              <button type="button" className="ed-btn ed-btn--primary" ref={mainRef} onClick={onClose}>
                닫기
              </button>
            </div>
          </>
        )}

        {phase.kind === 'error' && (
          <>
            <p>내보내지 못했어요.</p>
            <p className="ed-modal__error">{phase.message}</p>
            <div className="ed-modal__actions">
              <button type="button" className="ed-btn" onClick={() => setPhase({ kind: 'ask' })}>
                다시 해 보기
              </button>
              <button type="button" className="ed-btn ed-btn--primary" ref={mainRef} onClick={onClose}>
                닫기
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
