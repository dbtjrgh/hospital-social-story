// 원고의 practice.type → 연습 화면. 새 연습은 여기에 추가 (src/content/types.ts 의 Practice, tools/check.mjs 의 PRACTICES 도).
import type { Practice as PracticeData } from '../content/types';
import { BreathePractice } from './BreathePractice';
import { HoldPractice } from './HoldPractice';
import { LookAwayPractice } from './LookAwayPractice';
import { NameCallPractice } from './NameCallPractice';
import { PlacePadsPractice } from './PlacePadsPractice';
import { SequencePractice } from './SequencePractice';
import { TapAreaPractice } from './TapAreaPractice';

export function Practice({ data, onSuccess }: { data: PracticeData; onSuccess: () => void }) {
  switch (data.type) {
    case 'hold':
      return (
        <HoldPractice
          seconds={data.seconds}
          prompt={data.prompt}
          success={data.success}
          countAloud={data.countAloud}
          figure={data.figure}
          feel={data.feel}
          freeze={data.freeze}
          photo={data.photo}
          onSuccess={onSuccess}
        />
      );
    case 'nameCall':
      return <NameCallPractice onSuccess={onSuccess} />;
    case 'tapArea':
      return (
        <TapAreaPractice
          target={data.target}
          prompt={data.prompt}
          success={data.success}
          feel={data.feel}
          bareBelly={data.bareBelly}
          onSuccess={onSuccess}
        />
      );
    case 'placePads':
      return (
        <PlacePadsPractice
          spots={data.spots}
          prePlaced={data.prePlaced}
          prompt={data.prompt}
          success={data.success}
          feel={data.feel}
          bareChest={data.bareChest}
          bareFeet={data.bareFeet}
          onSuccess={onSuccess}
        />
      );
    case 'sequence':
      return <SequencePractice items={data.items} prompt={data.prompt} success={data.success} onSuccess={onSuccess} />;
    case 'breathe':
      return <BreathePractice count={data.count} prompt={data.prompt} success={data.success} onSuccess={onSuccess} />;
    case 'lookAway':
      return (
        <LookAwayPractice seconds={data.seconds} choices={data.choices} prompt={data.prompt} success={data.success} onSuccess={onSuccess} />
      );
  }
}
