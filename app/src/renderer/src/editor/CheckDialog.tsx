// 내보낸 zip 확인 창 (2026-10-09) — 내보내기 창 "브라우저에서 확인" · 메뉴 파일 → 내보낸 zip 브라우저로 확인 (Ctrl+Shift+B)
//   앱이 zip 을 다시 읽어 점검하고(맨 위 index.html·상대 경로·원고·사진·소리·편집기 코드), 잠깐 웹서버가 되어
//   서버의 하위 폴더(/web-check/)에 푼 것처럼 기본 브라우저로 엶 (src/main/webCheck.ts).
//   창을 닫아도 서버는 켜 둠(도구 막대 "웹 확인 중") → "확인 끝내기"로 끔. 앱을 끄면 같이 꺼짐
import { useEffect, useRef } from 'react';
import { setCheckOpen, startCheck, stopCheck, useEditor } from './editorState';

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

const MARK = { ok: '✓', warn: '!', fail: '✗' } as const;

export function CheckDialog() {
  const { check } = useEditor();
  const mainRef = useRef<HTMLButtonElement>(null);
  const close = () => setCheckOpen(false);

  useEffect(() => {
    mainRef.current?.focus();
  }, [check?.kind]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && check?.kind !== 'working') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [check?.kind]);

  if (!check) return null;
  const result = check.kind === 'done' ? check.result : null;
  const fails = result?.items.filter((i) => i.level === 'fail').length ?? 0;

  return (
    <div
      className="ed-modal"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && check.kind !== 'working') close();
      }}
    >
      <div className="ed-modal__box" role="dialog" aria-modal="true" aria-labelledby="ed-check-title">
        <h2 id="ed-check-title">내보낸 zip 확인</h2>

        {check.kind === 'working' && (
          <p role="status" className="ed-modal__working">
            zip 을 읽고 점검하는 중이에요…
          </p>
        )}

        {result && (
          <>
            <p>
              <strong>{fileName(result.file)}</strong>
              <span className="ed-muted"> · 파일 {result.count}개</span>
            </p>
            <ul className="ed-checks">
              {result.items.map((it) => (
                <li key={it.label} data-level={it.level}>
                  <span className="ed-checks__mark" aria-hidden="true">
                    {MARK[it.level]}
                  </span>
                  <span>
                    {it.label}
                    {it.detail && <span className="ed-muted"> — {it.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
            {result.url ? (
              <p className="ed-muted">
                앱이 잠깐 웹서버가 되어 브라우저로 열었어요. 서버의 하위 폴더에 푼 것과 같아요: <code>{result.url}</code>
                <br />이 PC 안에서만 열려요. 이 창을 닫아도 확인을 끝낼 때까지 열려 있어요.
              </p>
            ) : (
              <p className="ed-modal__error">맨 위에 index.html 이 없어 브라우저로 열지 않았어요.</p>
            )}
            {fails > 0 && <p className="ed-modal__error">고쳐야 할 것이 {fails}개 있어요. 이대로 서버에 올리면 제대로 안 보일 수 있어요.</p>}
            <div className="ed-modal__actions">
              <button type="button" className="ed-btn ed-btn--quiet" onClick={() => void startCheck(false)}>
                다른 zip 확인…
              </button>
              {result.url && (
                <button type="button" className="ed-btn" onClick={() => void window.ssApp?.openCheck()}>
                  브라우저로 다시 열기
                </button>
              )}
              <button type="button" className="ed-btn" onClick={() => void stopCheck()}>
                확인 끝내기
              </button>
              <button type="button" className="ed-btn ed-btn--primary" ref={mainRef} onClick={close}>
                닫기
              </button>
            </div>
          </>
        )}

        {check.kind === 'error' && (
          <>
            <p>zip 을 확인하지 못했어요.</p>
            <p className="ed-modal__error">{check.message}</p>
            <div className="ed-modal__actions">
              <button type="button" className="ed-btn" onClick={() => void startCheck(false)}>
                다른 zip 고르기…
              </button>
              <button type="button" className="ed-btn ed-btn--primary" ref={mainRef} onClick={() => void stopCheck()}>
                닫기
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
