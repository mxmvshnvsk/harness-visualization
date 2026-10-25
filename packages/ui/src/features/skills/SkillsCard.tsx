// Каталог скиллов: режим, описание, файлы и что с каждым случилось к моменту повтора.

import type { SkillSummary } from '@harness-visualization/harness';
import type { ReactElement } from 'react';
import {
  skillLoadAt,
  type Moment,
  type SkillLoad,
  type SkillsMemoryView,
} from '../../projections/projectSkillsMemory';
import styles from './SkillsMemory.module.css';

interface CardProps {
  view: SkillsMemoryView;
  shown: number;
  // Повтор дошёл до конца: «не загрузила» — уже итог, а не «пока».
  ended: boolean;
  onSeek: (moment: Moment) => void;
}

const MODES: Record<SkillSummary['mode'], string> = {
  on_demand: 'по выбору модели',
  always: 'всегда в prompt',
  manual: 'по команде /имя',
};

const TRIGGERS: Record<SkillLoad['trigger'], string> = {
  model: 'загрузила модель',
  always: 'загружен при старте',
  user: 'загрузил пользователь',
};

export function SkillsCard({ view, shown, ended, onSeek }: CardProps): ReactElement | null {
  if (view.catalog === null) {
    return null;
  }
  const { skills, problems, directory } = view.catalog;
  return (
    <section className={styles.card} aria-label="Скиллы">
      <header className={styles.head}>
        <h2 className={styles.title}>Скиллы</h2>
        <span className={styles.meta}>
          {directory}/ · {skills.length} в каталоге
        </span>
      </header>
      {skills.length === 0 && <p className={styles.muted}>Скиллов нет.</p>}
      <ul className={styles.list}>
        {skills.map((skill) => (
          <SkillRow
            key={skill.name}
            skill={skill}
            load={skillLoadAt(view, skill.name, shown)}
            ended={ended}
            onSeek={onSeek}
          />
        ))}
      </ul>
      {problems.map((problem) => (
        <p key={problem.folder} className={styles.problem}>
          {problem.folder} — не скилл: {problem.message}
        </p>
      ))}
    </section>
  );
}

interface SkillRowProps {
  skill: SkillSummary;
  load: SkillLoad | null;
  ended: boolean;
  onSeek: (moment: Moment) => void;
}

function SkillRow({ skill, load, ended, onSeek }: SkillRowProps): ReactElement {
  return (
    <li className={styles.skill} data-loaded={load === null ? 'false' : 'true'}>
      <div className={styles.skillHead}>
        <span className={styles.mono}>{skill.name}</span>
        <span className={styles.badge}>{MODES[skill.mode]}</span>
        <SkillStatus skill={skill} load={load} ended={ended} onSeek={onSeek} />
      </div>
      <p className={styles.description}>{skill.description}</p>
      <span className={styles.meta}>
        инструкция ≈ {skill.instructionCharacters.toLocaleString('ru-RU')} симв.
        {skill.files.length > 0 && ` · файлы: ${skill.files.join(', ')}`}
      </span>
    </li>
  );
}

function SkillStatus({ skill, load, ended, onSeek }: SkillRowProps): ReactElement {
  if (load !== null) {
    return (
      <button
        type="button"
        className={styles.event}
        onClick={() => {
          onSeek(load);
        }}
      >
        {TRIGGERS[load.trigger]} · {load.place}
      </button>
    );
  }
  return <span className={styles.muted}>{statusText(skill, ended)}</span>;
}

function statusText(skill: SkillSummary, ended: boolean): string {
  if (skill.mode === 'manual') {
    return 'не в каталоге — модель о нём не знает';
  }
  return ended ? 'модель видела в каталоге, но не загрузила' : 'в каталоге, пока не загружен';
}
