// 페이지마다 고칠 수 있는 글 칸 (편집 모드 오른쪽 "글", CLAUDE.md 1-c ⑥단계).
// 칸 = 원고의 한 자리(JSON Pointer). 고친 글은 그 자리에 그대로 들어감 (actions.ts setText)
// 문장 점검(쓰면 안 되는 표현·** 짝)은 원고 검사기와 같은 규칙 (content/rules.ts) → 칸 아래·빠진 것·내보내기 창에 보임
import { exams, getExam, hospital } from '../content';
import { textProblems } from '../content/rules';
import type { ExamContent } from '../content/types';
import type { Route } from '../lib/router';

export interface TextField {
  /** 페이지 안에서 고유한 이름 (다시 띄운 뒤 커서 되살리기) */
  key: string;
  label: string;
  /** hospital.json 또는 exams/<검사>.json */
  file: string;
  pointer: string;
  /** 목록 칸이면 한 줄에 하나씩 (보호자 안내) */
  value: string | string[];
  /** 비울 수 없음 (화면이 이 글을 꼭 씀) */
  required?: boolean;
  /** 여러 줄 (Enter 가 줄 바꿈). 아니면 Enter = 고치기 끝 */
  multiline?: boolean;
  /** **낱말** 형광펜을 쓰는 칸 (단계의 행동 문장) */
  marks?: boolean;
  /** {companion} 호칭을 쓰는 칸 */
  companion?: boolean;
  hint?: string;
  /** 이 글을 읽는 음성 파일이 따로 있음 → 문장을 바꾸면 음성도 새로 넣어야 함 */
  voiced?: boolean;
  /** 고치면 화면을 다시 띄움 (첫 화면 카드 글처럼 시작할 때 만들어 두는 글) */
  reload?: boolean;
}

export interface TextGroup {
  title: string;
  fields: TextField[];
}

const examFile = (exam: ExamContent) => `exams/${exam.id}.json`;

function stepGroups(exam: ExamContent, i: number): TextGroup[] {
  const step = exam.steps[i];
  const file = examFile(exam);
  const at = `/steps/${i}`;
  const voiced = !!step.audio && !step.speech;
  const main: TextField[] = [
    {
      key: 'text',
      label: '할 일 (큰 글씨)',
      file,
      pointer: `${at}/text`,
      value: step.text,
      required: true,
      marks: true,
      companion: true,
      voiced,
      hint: '한 화면에 행동 하나. 짧고 긍정적인 말로 ("~해요")',
    },
    { key: 'sub', label: '설명 (작은 글씨)', file, pointer: `${at}/sub`, value: step.sub ?? '', multiline: true, companion: true, voiced },
  ];
  if (step.speech !== undefined) {
    main.push({
      key: 'speech',
      label: '읽어 줄 문장 (따로 쓴 것)',
      file,
      pointer: `${at}/speech`,
      value: step.speech,
      multiline: true,
      companion: true,
      hint: '비우면 위 할 일·설명을 그대로 읽어요',
    });
  }
  main.push({
    key: 'imageAlt',
    label: '사진 설명 (화면 읽기용)',
    file,
    pointer: `${at}/imageAlt`,
    value: step.imageAlt,
    required: true,
    companion: true,
    hint: '사진을 볼 수 없는 사람에게 읽어 주는 설명',
  });
  const groups: TextGroup[] = [{ title: '이 단계 문장', fields: main }];

  const senses = (step.sensory ?? []).map<TextField>((s, j) => ({
    key: `sense-${j}`,
    label: `미리 알아 두기 ${j + 1}`,
    file,
    pointer: `${at}/sensory/${j}/text`,
    value: s.text,
    required: true,
    companion: true,
  }));
  if (senses.length) groups.push({ title: '미리 알아 두기', fields: senses });

  const p = step.practice;
  if (p && p.type !== 'nameCall') {
    const fields: TextField[] = [
      { key: 'prompt', label: '연습 안내', file, pointer: `${at}/practice/prompt`, value: p.prompt, required: true },
      { key: 'success', label: '해냈을 때', file, pointer: `${at}/practice/success`, value: p.success, required: true },
    ];
    if ('feel' in p && p.feel) {
      fields.push({ key: 'feel', label: '해낸 뒤 느낌 안내', file, pointer: `${at}/practice/feel/text`, value: p.feel.text, required: true });
    }
    groups.push({ title: '연습 문장', fields });
  }

  groups.push({
    title: '보호자',
    fields: [
      {
        key: 'tip',
        label: '이 단계 보호자 팁',
        file,
        pointer: `${at}/caregiverTip`,
        value: step.caregiverTip ?? '',
        multiline: true,
        companion: true,
        hint: '보호자 메뉴 "지금 단계에서"에 보여요',
      },
    ],
  });
  return groups;
}

/** 이 페이지의 글 칸 */
export function pageTexts(route: Route): TextGroup[] {
  if (route.name === 'home') {
    return [
      {
        title: '병원',
        fields: [{ key: 'hospital-name', label: '병원 이름', file: 'hospital.json', pointer: '/name', value: hospital.name, required: true, hint: '다 모은 축하 화면에 보여요' }],
      },
    ];
  }
  if (route.name !== 'exam') return [];
  const exam = getExam(route.examId);
  if (!exam) return [];
  const file = examFile(exam);
  const last = exam.steps.length + 2;
  if (route.page === 0) {
    return [
      {
        title: '표지',
        fields: [
          { key: 'title', label: '검사 이름', file, pointer: '/title', value: exam.title, required: true, reload: true, hint: '첫 화면 카드와 위 막대에도 보여요' },
          { key: 'easyTitle', label: '쉬운 말', file, pointer: '/easyTitle', value: exam.easyTitle ?? '', reload: true, hint: '예: 가슴 사진 찍기' },
          { key: 'lead', label: '표지 안내 문장', file, pointer: '/cover/lead', value: exam.cover.lead, required: true },
          { key: 'coverAlt', label: '표지 사진 설명 (화면 읽기용)', file, pointer: '/cover/imageAlt', value: exam.cover.imageAlt, required: true, companion: true },
        ],
      },
      {
        title: '보호자 안내 (보호자 메뉴)',
        fields: [
          {
            key: 'before',
            label: '검사 전에',
            file,
            pointer: '/caregiver/before',
            value: exam.caregiver.before,
            multiline: true,
            companion: true,
            hint: '한 줄에 하나씩',
          },
          { key: 'tips', label: '도움이 되는 방법', file, pointer: '/caregiver/tips', value: exam.caregiver.tips, multiline: true, companion: true, hint: '한 줄에 하나씩' },
        ],
      },
    ];
  }
  if (route.page === 1) {
    return [
      {
        title: '순서 (묶음 = 스티커 하나)',
        fields: exam.phases.map((p, i) => ({
          key: `phase-${p.id}`,
          label: `${i + 1}번 묶음 이름`,
          file,
          pointer: `/phases/${i}/title`,
          value: p.title,
          required: true,
          hint: i === 0 ? '순서 화면·스티커판·스티커 받을 때 보여요' : undefined,
        })),
      },
    ];
  }
  if (route.page >= last) {
    return [{ title: '칭찬 스티커판', fields: [{ key: 'reward', label: '칭찬 문장', file, pointer: '/reward/message', value: exam.reward.message, required: true }] }];
  }
  return stepGroups(exam, route.page - 2);
}

/** 글 칸 값 → 고칠 때 보이는 글 (목록 칸은 한 줄에 하나씩) */
export function fieldText(field: TextField): string {
  return Array.isArray(field.value) ? field.value.join('\n') : field.value;
}

/** 글 칸 하나의 문제 (목록 칸은 줄마다) */
export function fieldProblems(field: TextField, text = fieldText(field)): string[] {
  const out = new Set<string>();
  const lines = Array.isArray(field.value) ? text.split('\n') : [text];
  for (const line of lines) for (const p of textProblems(line)) out.add(p);
  if (field.required && !text.trim()) out.add('비워 둘 수 없어요');
  return [...out];
}

export interface TextIssue {
  route: Route;
  /** "흉부 엑스레이 3단계 · 할 일" */
  label: string;
  problems: string[];
}

/** 프로젝트 전체에서 문제가 있는 글 칸 (빠진 것 목록·내보내기 창) */
export function textIssues(pageName: (route: Route) => string): TextIssue[] {
  const routes: Route[] = [{ name: 'home' }];
  for (const exam of exams) {
    for (let page = 0; page <= exam.steps.length + 2; page += 1) routes.push({ name: 'exam', examId: exam.id, page });
  }
  const out: TextIssue[] = [];
  for (const route of routes) {
    for (const group of pageTexts(route)) {
      for (const field of group.fields) {
        const problems = fieldProblems(field);
        if (problems.length) out.push({ route, label: `${pageName(route)} · ${field.label}`, problems });
      }
    }
  }
  return out;
}
