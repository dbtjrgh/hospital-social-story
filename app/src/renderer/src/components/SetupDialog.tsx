// 처음 열 때 보호자 초기 설정 (본인 요청 2026-10-07): 보호자가 아이와 같이 보기 전에 한 번에 정함 — 함께 가는 사람·아이 이름·바늘·피 사진.
// 10-08부터 전체 화면 대신 첫 화면(검사 고르기) 위에 가운데 창으로 (본인 요청) → 뒤에 무엇을 하게 될지 보임.
// 처음 열 때와 "다음 사람을 위해 지우기" 뒤에 뜸. 검사 QR로 바로 들어오면 안 띄움 (기본값으로 바로 연습).
// 시작하기 = 고른 것 저장 / 건너뛰기 = 기본값 그대로. 나중에 보호자 메뉴에서 바꿀 수 있음.
// 호칭을 정하지 않으면 1단계부터 기본값("엄마/아빠와 함께")으로 읽어서, 아이가 듣기 전에 정하게 함.
// 배경 누르기·뒤로 가기·Esc로는 닫히지 않음 → 아이가 잘못 눌러 넘어가지 않게 두 버튼으로만
import { useLayoutEffect, useState } from 'react';
import { COMPANIONS, defaultSettings, finishSetup } from '../lib/store';
import { useTapGuard } from '../lib/tapGuard';
import { CompanionHint } from './CompanionHint';
import { Icon } from './Icon';
import { Overlay } from './Overlay';
import { NAME_HINT, NAME_LABEL, NAME_PLACEHOLDER } from './settingHints';

export function SetupDialog() {
  const [companion, setCompanion] = useState(defaultSettings.companion);
  const [name, setName] = useState('');
  const [hideNeedle, setHideNeedle] = useState(defaultSettings.hideNeedle);
  const guard = useTapGuard();
  // 앱을 처음 열면 이 창이 앱 틀과 같이 그려져서, 그 순간에는 틀(data-app-frame)이 아직 문서에 없음 → 창이 틀 밖(body)에 붙었음.
  // 틀이 붙은 뒤(그리기 전)에 띄움 → 다른 창처럼 틀 안에 뜨고 뒤 화면만 inert
  const [framed, setFramed] = useState(false);
  useLayoutEffect(() => setFramed(true), []);
  if (!framed) return null;

  return (
    <Overlay label="보호자님, 시작하기 전에" className="overlay--setup">
      <div className="setup">
        <div className="setup__head">
          <h2>보호자님, 시작하기 전에</h2>
          <p>아이와 같이 보기 전에 정해 주세요</p>
        </div>
        <div className="field">
          함께 가는 사람
          <CompanionHint companion={companion} />
          <div className="chips">
            {COMPANIONS.map((c) => (
              <button key={c} type="button" className="chip" aria-pressed={companion === c} onClick={() => setCompanion(c)}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          {NAME_LABEL}
          <span className="field__hint">{NAME_HINT}</span>
          <input type="text" value={name} maxLength={12} placeholder={NAME_PLACEHOLDER} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          바늘·피 사진 (채혈·주사)
          <div className="chips">
            <button type="button" className="chip" aria-pressed={!hideNeedle} onClick={() => setHideNeedle(false)}>
              보이기
            </button>
            <button type="button" className="chip" aria-pressed={hideNeedle} onClick={() => setHideNeedle(true)}>
              가리기
            </button>
          </div>
        </div>
        <p className="setup__note">
          <Icon name="people" />
          나중에 오른쪽 위 '보호자'를 길게 누르면 바꿀 수 있어요
        </p>
        <div className="setup__actions">
          <button type="button" className="btn btn--soft setup__skip" onClick={guard(() => finishSetup())}>
            건너뛰기
          </button>
          <button type="button" className="btn btn--primary" onClick={guard(() => finishSetup({ companion, name, hideNeedle }))}>
            시작하기
            <Icon name="next" />
          </button>
        </div>
      </div>
    </Overlay>
  );
}
