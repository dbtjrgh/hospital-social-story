// 보호자 메뉴: 검사 안내 + 설정. 아이가 실수로 바꾸지 않도록 버튼을 길게 눌러야 열림.
import type { ExamContent, Step } from '../content/types';
import { stopSound } from '../lib/sound';
import { stopSpeaking } from '../lib/speech';
import { COMPANIONS, resetAll, setShowSetup, updateSettings, useSettings } from '../lib/store';
import { Icon } from './Icon';
import { clearForNextPerson } from './NextPersonButton';
import { CompanionHint } from './CompanionHint';
import { Overlay } from './Overlay';
import { NAME_HINT, NAME_LABEL, NAME_PLACEHOLDER } from './settingHints';
import { StepPicker } from './StepPicker';
import { useFill } from './RichText';

// 의료진을 "선생님"이라고 부르므로 같이 가는 선생님은 "학교 선생님" (누가 누구인지 헷갈리지 않게 — 2026-10-06 최종 검토)
const TEXT_SCALES = [
  { label: '보통', value: 1 },
  { label: '크게', value: 1.15 },
  { label: '아주 크게', value: 1.3 },
];
const MOTION = [
  { label: '기기 설정 따름', value: 'system' },
  { label: '움직임 줄이기', value: 'on' },
  { label: '움직임 켜기', value: 'off' },
] as const;

export function CaregiverSheet({ exam, step, onClose }: { exam?: ExamContent; step?: Step; onClose: () => void }) {
  const s = useSettings();
  const fill = useFill();

  return (
    <Overlay label="보호자 안내" onClose={onClose}>
      <div className="sheet">
        <div className="sheet__head">
          <h2>보호자 안내</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
            <Icon name="close" />
          </button>
        </div>

        {exam && <StepPicker exam={exam} current={step} onPick={onClose} />}

        {step?.caregiverTip && (
          <>
            <h3>지금 단계에서</h3>
            <ul>
              <li>{fill(step.caregiverTip)}</li>
            </ul>
          </>
        )}
        {exam && (
          <>
            <h3>{exam.title} 전에</h3>
            <ul>
              {exam.caregiver.before.map((t) => (
                <li key={t}>{fill(t)}</li>
              ))}
            </ul>
            <h3>도움이 되는 방법</h3>
            <ul>
              {exam.caregiver.tips.map((t) => (
                <li key={t}>{fill(t)}</li>
              ))}
            </ul>
          </>
        )}

        <h3>설정</h3>
        <div className="field">
          함께 가는 사람
          <CompanionHint companion={s.companion} />
          <div className="chips">
            {COMPANIONS.map((c) => (
              <button key={c} type="button" className="chip" aria-pressed={s.companion === c} onClick={() => updateSettings({ companion: c })}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          {NAME_LABEL}
          <span className="field__hint">{NAME_HINT}</span>
          <input
            type="text"
            value={s.name}
            maxLength={12}
            placeholder={NAME_PLACEHOLDER}
            onChange={(e) => updateSettings({ name: e.target.value })}
          />
        </label>
        <div className="field">
          소리
          <div className="chips">
            <button type="button" className="chip" aria-pressed={s.sound} onClick={() => updateSettings({ sound: true })}>켜기</button>
            {/* 끄면 지금 읽던 말·소리도 바로 멈춤 (예전에는 읽던 문장을 끝까지 읽었음 — 2026-10-07 검수) */}
            <button
              type="button"
              className="chip"
              aria-pressed={!s.sound}
              onClick={() => {
                updateSettings({ sound: false });
                stopSpeaking();
                stopSound();
              }}
            >
              끄기
            </button>
          </div>
        </div>
        {/* 소리 켜기·끄기와 같은 줄에 있으면 셋 중 하나를 고르는 것처럼 보여서 따로 (2026-10-07 다듬기) */}
        <div className="field">
          페이지마다 자동으로 읽기
          <div className="chips">
            <button type="button" className="chip" aria-pressed={s.readAloud} onClick={() => updateSettings({ readAloud: true })}>켜기</button>
            <button
              type="button"
              className="chip"
              aria-pressed={!s.readAloud}
              onClick={() => {
                updateSettings({ readAloud: false });
                stopSpeaking();
              }}
            >
              끄기
            </button>
          </div>
        </div>
        <div className="field">
          글자 크기
          <div className="chips">
            {TEXT_SCALES.map((t) => (
              <button key={t.value} type="button" className="chip" aria-pressed={s.textScale === t.value} onClick={() => updateSettings({ textScale: t.value })}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          바늘·피 사진 (채혈·주사)
          <div className="chips">
            <button type="button" className="chip" aria-pressed={!s.hideNeedle} onClick={() => updateSettings({ hideNeedle: false })}>보이기</button>
            <button type="button" className="chip" aria-pressed={s.hideNeedle} onClick={() => updateSettings({ hideNeedle: true })}>가리기</button>
          </div>
        </div>
        {/* 덜 바꾸는 설정은 접어 둠 → 처음 보는 보호자가 볼 양을 줄임 (2026-10-07 간략화, 본인 선택).
            연습 먼저 하기(본인 요청 10-07): 끄면 연습을 못 해도 "했어요"를 누를 수 있음 (손 쓰기가 어려운 아이) */}
        <details className="more-settings">
          <summary>더 많은 설정</summary>
          <label className="field">
            소리 크기
            <input type="range" min={0.1} max={1} step={0.05} value={s.volume} onChange={(e) => updateSettings({ volume: Number(e.target.value) })} />
          </label>
          <div className="field">
            화면 움직임
            <div className="chips">
              {MOTION.map((m) => (
                <button key={m.value} type="button" className="chip" aria-pressed={s.reduceMotion === m.value} onClick={() => updateSettings({ reduceMotion: m.value })}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {/* 이름만 보고는 무엇인지 알기 어려운 설정은 아래에 한 줄 설명 (본인 요청 10-07) */}
          <div className="field">
            연습 먼저 하기
            <span className="field__hint">연습을 해야 "했어요"를 누를 수 있어요. 손 쓰기가 어려우면 꺼 주세요</span>
            <div className="chips">
              <button type="button" className="chip" aria-pressed={s.practiceGate} onClick={() => updateSettings({ practiceGate: true })}>켜기</button>
              <button type="button" className="chip" aria-pressed={!s.practiceGate} onClick={() => updateSettings({ practiceGate: false })}>끄기</button>
            </div>
          </div>
          <div className="field">
            손가락 안내
            <span className="field__hint">한참 멈춰 있으면 손가락이 누를 곳을 가리켜요</span>
            <div className="chips">
              <button type="button" className="chip" aria-pressed={s.guideHand} onClick={() => updateSettings({ guideHand: true })}>켜기</button>
              <button type="button" className="chip" aria-pressed={!s.guideHand} onClick={() => updateSettings({ guideHand: false })}>끄기</button>
            </div>
          </div>
          {/* 현장에 따라 초기 설정 화면 없이 (본인 요청 10-07): 끄면 처음 열 때·다음 사람 지우기 뒤에도 바로 첫 화면. 이 설정은 지워도 남음.
              켜면 다음 사람부터 (지금 화면이 초기 설정으로 바뀌지 않게) */}
          <div className="field">
            초기 설정 화면
            <span className="field__hint">처음 열 때 나오는 "보호자님, 시작하기 전에" 화면이에요. 꺼 두면 기록을 지운 뒤에도 안 나와요</span>
            <div className="chips">
              <button type="button" className="chip" aria-pressed={s.showSetup} onClick={() => setShowSetup(true)}>켜기</button>
              <button type="button" className="chip" aria-pressed={!s.showSetup} onClick={() => setShowSetup(false)}>끄기</button>
            </div>
          </div>
        </details>
        <div className="field">
          <button
            type="button"
            className="btn--line"
            onClick={() => {
              if (window.confirm('모든 검사의 스티커와 연습 기록을 지울까요?')) resetAll();
            }}
          >
            스티커·연습 기록 지우기
          </button>
          {/* 병원 공용 태블릿: 이름·설정까지 처음 상태로 (스티커판·축하 화면의 길게 누르기 버튼과 같음) */}
          <button
            type="button"
            className="btn--line"
            onClick={() => {
              if (clearForNextPerson()) onClose();
            }}
          >
            다음 사람을 위해 모두 지우기
          </button>
        </div>
        <p className="sheet__note">
          시안입니다. 사진은 임시 이미지이고, 원고·사진·음성은 병원 자료로 바뀝니다.
          {exam?.source === 'draft' ? ' 이 검사의 원고는 초안이에요.' : ''}
        </p>
      </div>
    </Overlay>
  );
}
